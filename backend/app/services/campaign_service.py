import random
import re
from html import escape as html_escape
import uuid
from datetime import datetime, timezone

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.service_creds import get_live_creds
from app.integrations.email_client import email_client
from app.models.campaign import Campaign
from app.models.campaign_history import CampaignHistory
from app.models.user import User
from app.services.personalize import personalize  # noqa: F401  (re-exported for callers/tests)
from app.services import email_domain_service, email_event_service, merge_tag_service
from app.services import unsubscribe_service
from app.services.email_tracking import instrument_html, tracking_enabled
from app.services.email_provider_service import NOT_CONFIGURED_MESSAGE, get_provider, public_api_base
from app.integrations.email_delivery import EmailSendError, customer_safe
from app.core.config import settings
from app.models.contact import Contact
from app.models.enums import CampaignStatus, EventType
from app.models.event import Event
from app.models.organization import Organization
from app.models.segment import Segment
from app.schemas.audience import SegmentRule
from app.services.audience_service import build_segment_query
from app.services.plan_service import get_credit_rate, get_plan_limit
from app.services.wallet_service import InsufficientBalanceError, deduct, get_balance


class CampaignNotFoundError(Exception):
    pass


class SegmentRequiredError(Exception):
    pass


class CampaignAlreadySentError(Exception):
    pass


class CampaignNotSendingError(Exception):
    pass


class CampaignNotEditableError(Exception):
    """Only drafts can be edited or reverted; sent/sending campaigns are a record of what went out."""


class CampaignHistoryNotFoundError(Exception):
    pass


TRACKED_FIELDS = ("name", "subject", "html_body", "segment_id", "sender_id", "reply_to")


def _snapshot(campaign: Campaign) -> dict:
    return {
        "name": campaign.name,
        "subject": campaign.subject,
        "html_body": campaign.html_body,
        "segment_id": str(campaign.segment_id) if campaign.segment_id else None,
        "sender_id": str(campaign.sender_id) if campaign.sender_id else None,
        "reply_to": campaign.reply_to,
    }


async def _record_history(
    db: AsyncSession,
    org_id: uuid.UUID,
    campaign_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    changes: dict,
    source_history_id: uuid.UUID | None = None,
) -> None:
    db.add(
        CampaignHistory(
            organization_id=org_id,
            campaign_id=campaign_id,
            changed_by_user_id=user_id,
            action=action,
            changes=changes,
            source_history_id=source_history_id,
        )
    )


async def create_campaign(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    name: str,
    segment_id: uuid.UUID,
    subject: str,
    html_body: str,
    sender_id: uuid.UUID | None = None,
    reply_to: str | None = None,
    changed_by_user_id: uuid.UUID | None = None,
) -> Campaign:
    segment = await db.scalar(
        select(Segment).where(Segment.organization_id == org_id, Segment.id == segment_id)
    )
    if segment is None:
        raise SegmentRequiredError(segment_id)

    campaign = Campaign(
        organization_id=org_id,
        segment_id=segment_id,
        sender_id=sender_id,
        reply_to=(reply_to or "").strip() or None,
        name=name,
        subject=subject,
        html_body=html_body,
        status=CampaignStatus.DRAFT,
    )
    db.add(campaign)
    await db.flush()
    await _record_history(
        db, org_id, campaign.id, changed_by_user_id, "created",
        {f: {"old": None, "new": v} for f, v in _snapshot(campaign).items()},
    )
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def get_campaign(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID, *, include_deleted: bool = False
) -> Campaign:
    query = select(Campaign).where(Campaign.organization_id == org_id, Campaign.id == campaign_id)
    if not include_deleted:
        query = query.where(Campaign.deleted_at.is_(None))
    campaign = await db.scalar(query)
    if campaign is None:
        raise CampaignNotFoundError(campaign_id)
    return campaign


async def list_campaigns(db: AsyncSession, org_id: uuid.UUID) -> list[Campaign]:
    result = await db.scalars(
        select(Campaign)
        .where(Campaign.organization_id == org_id, Campaign.deleted_at.is_(None))
        .order_by(Campaign.created_at.desc())
    )
    return list(result)


async def list_trashed_campaigns(db: AsyncSession, org_id: uuid.UUID) -> list[Campaign]:
    result = await db.scalars(
        select(Campaign)
        .where(Campaign.organization_id == org_id, Campaign.deleted_at.isnot(None))
        .order_by(Campaign.deleted_at.desc())
    )
    return list(result)


async def update_campaign(
    db: AsyncSession,
    org_id: uuid.UUID,
    campaign_id: uuid.UUID,
    changed_by_user_id: uuid.UUID | None,
    **fields,
) -> Campaign:
    campaign = await get_campaign(db, org_id, campaign_id)
    if campaign.status != CampaignStatus.DRAFT:
        raise CampaignNotEditableError(campaign_id)

    new_segment = fields.get("segment_id")
    if new_segment is not None:
        segment = await db.scalar(
            select(Segment).where(Segment.organization_id == org_id, Segment.id == new_segment)
        )
        if segment is None:
            raise SegmentRequiredError(new_segment)

    before = _snapshot(campaign)
    for key, value in fields.items():
        if value is not None and key in TRACKED_FIELDS:
            setattr(campaign, key, value)
    campaign.reply_to = (campaign.reply_to or "").strip() or None   # an empty value clears it
    after = _snapshot(campaign)
    changes = {f: {"old": before[f], "new": after[f]} for f in TRACKED_FIELDS if before[f] != after[f]}
    if changes:
        await _record_history(db, org_id, campaign.id, changed_by_user_id, "updated", changes)
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def soft_delete_campaign(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID, changed_by_user_id: uuid.UUID | None
) -> None:
    campaign = await get_campaign(db, org_id, campaign_id)
    if campaign.status == CampaignStatus.SENDING:
        raise CampaignNotEditableError(campaign_id)
    campaign.deleted_at = datetime.now(timezone.utc)
    await _record_history(db, org_id, campaign.id, changed_by_user_id, "deleted", {})
    await db.commit()


async def restore_campaign(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID, changed_by_user_id: uuid.UUID | None
) -> Campaign:
    campaign = await get_campaign(db, org_id, campaign_id, include_deleted=True)
    if campaign.deleted_at is None:
        raise CampaignNotFoundError(campaign_id)
    campaign.deleted_at = None
    await _record_history(db, org_id, campaign.id, changed_by_user_id, "restored", {})
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def list_campaign_history(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> list[dict]:
    await get_campaign(db, org_id, campaign_id, include_deleted=True)
    rows = await db.execute(
        select(CampaignHistory, User.email)
        .outerjoin(User, User.id == CampaignHistory.changed_by_user_id)
        .where(CampaignHistory.organization_id == org_id, CampaignHistory.campaign_id == campaign_id)
        .order_by(CampaignHistory.created_at.desc())
    )
    return [
        {
            "id": h.id,
            "action": h.action,
            "changes": h.changes,
            "changed_by_user_id": h.changed_by_user_id,
            "changed_by_email": email,
            "source_history_id": h.source_history_id,
            "created_at": h.created_at,
        }
        for h, email in rows
    ]


async def revert_campaign_history(
    db: AsyncSession,
    org_id: uuid.UUID,
    campaign_id: uuid.UUID,
    history_id: uuid.UUID,
    changed_by_user_id: uuid.UUID | None,
) -> Campaign:
    """Undo the field changes recorded in one history entry (sets each field back to its 'old' value)."""
    campaign = await get_campaign(db, org_id, campaign_id)
    if campaign.status != CampaignStatus.DRAFT:
        raise CampaignNotEditableError(campaign_id)
    entry = await db.scalar(
        select(CampaignHistory).where(
            CampaignHistory.id == history_id,
            CampaignHistory.organization_id == org_id,
            CampaignHistory.campaign_id == campaign_id,
        )
    )
    if entry is None or entry.action != "updated":
        raise CampaignHistoryNotFoundError(history_id)

    before = _snapshot(campaign)
    for field, change in entry.changes.items():
        if field not in TRACKED_FIELDS or change.get("old") is None:
            continue
        value = uuid.UUID(change["old"]) if field in ("segment_id", "sender_id") else change["old"]
        setattr(campaign, field, value)
    after = _snapshot(campaign)
    changes = {f: {"old": before[f], "new": after[f]} for f in TRACKED_FIELDS if before[f] != after[f]}
    if not changes:
        raise CampaignHistoryNotFoundError(history_id)
    await _record_history(db, org_id, campaign.id, changed_by_user_id, "reverted", changes, source_history_id=history_id)
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def event_counts_for_campaign(db: AsyncSession, campaign_id: uuid.UUID) -> dict[str, int]:
    result = await db.execute(
        select(Event.type, func.count()).where(Event.campaign_id == campaign_id).group_by(Event.type)
    )
    counts = {row[0].value: row[1] for row in result.all()}
    return {
        "sent": counts.get("sent", 0),
        "opened": counts.get("opened", 0),
        "clicked": counts.get("clicked", 0),
        "failed": counts.get("failed", 0),
    }


async def mark_campaign_sending(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    """Fast, synchronous half of "send": flips DRAFT -> SENDING and returns
    immediately. The actual sending happens in send_campaign, run from a
    Celery task — never inline in the request path (plan.md's background
    jobs rule)."""
    campaign = await get_campaign(db, org_id, campaign_id)
    if campaign.status != CampaignStatus.DRAFT:
        raise CampaignAlreadySentError(campaign_id)

    campaign.status = CampaignStatus.SENDING
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def count_emails_this_month(db: AsyncSession, org_id: uuid.UUID) -> int:
    now = datetime.now(timezone.utc)
    result = await db.scalar(
        select(func.count(Event.id)).where(
            Event.organization_id == org_id,
            Event.type == EventType.SENT,
            extract("year", Event.occurred_at) == now.year,
            extract("month", Event.occurred_at) == now.month,
        )
    )
    return result or 0


async def send_campaign(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    """Does the actual sending. Called from app/workers/tasks.py, not
    directly from the API route — see mark_campaign_sending above.

    Emails beyond the org's plan limit for the current calendar month are
    charged from the wallet at the configured email_overage rate; sends that
    can't be charged due to insufficient balance are skipped (not sent) and
    recorded as failed, rather than aborting the whole campaign.
    """
    campaign = await get_campaign(db, org_id, campaign_id)
    if campaign.status != CampaignStatus.SENDING:
        raise CampaignAlreadySentError(campaign_id)

    segment = await db.scalar(select(Segment).where(Segment.id == campaign.segment_id))
    rules = [SegmentRule(**r) for r in segment.rules]
    query = build_segment_query(org_id, rules, segment.match_type).where(Contact.email.isnot(None))
    contacts = (await db.scalars(query)).all()

    campaign.total_recipients = len(contacts)
    await db.commit()

    monthly_limit = await get_plan_limit(db, org_id, "emails_monthly_limit")
    emails_sent_this_month = await count_emails_this_month(db, org_id)
    overage_rate = await get_credit_rate(db, "email_overage")
    # rate is per 1,000 emails — charge per-email, amortised.
    per_email_overage_paisa = (
        max(1, int(overage_rate.rate_bdt * 100) // 1000) if overage_rate else None
    )

    provider = await get_provider(db)
    sender_info = await email_domain_service.resolve_sender(db, org_id, campaign.sender_id)
    blocker = None
    if not provider.configured:
        blocker = NOT_CONFIGURED_MESSAGE
    elif sender_info and sender_info["domain_status"] == "deleted":
        blocker = f"The sender domain {sender_info['domain']} is in the trash. Restore it in Sending Domains."
    elif sender_info and sender_info["domain_status"] == "pending":
        blocker = f"The sender domain {sender_info['domain']} is not verified yet."
    elif sender_info and sender_info["domain_status"] == "paused":
        blocker = f"Sending is paused for {sender_info['domain']}: {sender_info['paused_reason']}"
    elif sender_info and provider.kind == "ses" and sender_info["domain_provider"] != "ses":
        blocker = f"{sender_info['domain']} isn't registered with Amazon SES. Open Sending Domains and click 'Register with Amazon SES'."
    if blocker:
        campaign.status = CampaignStatus.FAILED
        db.add(Event(organization_id=org_id, campaign_id=campaign.id, type=EventType.FAILED, extra={"error": blocker}))
        await db.commit()
        await db.refresh(campaign)
        from app.services import inbox  # noqa: PLC0415

        await inbox.notify(db, org_id, await inbox.recipients_with_permission(db, org_id, "email"), category="campaigns",
                           kind="campaign_failed", title=f"Email campaign “{campaign.name}” couldn't be sent",
                           body=blocker[:300], link=f"/campaigns/{campaign.id}")
        return campaign
    api_base = await public_api_base(db)
    track = tracking_enabled(provider.kind)
    suppressed = await email_event_service.suppressed_emails(db, org_id)
    daily_left = settings.email_daily_cap_per_org - await email_event_service.sent_today(db, org_id)

    custom_tags = await merge_tag_service.merge_tag_values(db, org_id)
    sending_org = await db.get(Organization, org_id)
    has_unsub_tag = bool(unsubscribe_service.PLACEHOLDER_RE.search(campaign.html_body or ""))

    cancelled = False
    processed = 0
    for contact in contacts:
        # Commit every few contacts so the sent/failed events become visible to
        # other requests — that is what drives the live progress bar (and what a
        # page refresh reads back). Without it nothing shows until the very end.
        processed += 1
        if processed % 5 == 0:
            await db.commit()
        if contact.email.lower() in suppressed:
            db.add(Event(organization_id=org_id, campaign_id=campaign.id, contact_id=contact.id,
                         type=EventType.FAILED, extra={"error": "not emailed: unsubscribed, or an earlier bounce / spam complaint"}))
            continue
        if daily_left <= 0:
            db.add(Event(organization_id=org_id, campaign_id=campaign.id, contact_id=contact.id,
                         type=EventType.FAILED, extra={"error": "daily_sending_limit_reached"}))
            continue
        # Cheap poll for a cancel request between sends — lets the send loop
        # stop promptly without needing to kill the Celery worker.
        cancel_requested = await db.scalar(
            select(Campaign.cancel_requested).where(Campaign.id == campaign.id)
        )
        if cancel_requested:
            cancelled = True
            break

        over_limit = monthly_limit != -1 and emails_sent_this_month >= monthly_limit
        if over_limit and per_email_overage_paisa is not None:
            try:
                await deduct(
                    db,
                    org_id,
                    per_email_overage_paisa,
                    service="email_overage",
                    units=1,
                    reference_id=str(campaign.id),
                    note="Email overage",
                )
                await db.commit()
            except InsufficientBalanceError:
                db.add(
                    Event(
                        organization_id=org_id,
                        campaign_id=campaign.id,
                        contact_id=contact.id,
                        type=EventType.FAILED,
                        extra={"error": "insufficient_balance"},
                    )
                )
                continue
        # over_limit with no rate configured: allow free overage (admin's choice).

        try:
            unsub_url = unsubscribe_service.unsubscribe_url(api_base, org_id, contact.email, campaign.id)
            body = personalize(campaign.html_body, contact, {**custom_tags, "unsubscribe_url": unsub_url})
            html = instrument_html(body, campaign.id, contact.id, api_base) if track else body
            # sender identity + unsubscribe link are added last, so the unsubscribe link is never rewritten by click tracking
            html = unsubscribe_service.apply_footer(html, unsub_url, sending_org, has_placeholder=has_unsub_tag)
            message_id = await email_client.send_email(
                db, org_id=org_id, to_email=contact.email, subject=personalize(campaign.subject or "", contact, custom_tags, escape=False), html_body=html,
                from_email=sender_info["from_email"] if sender_info else None,
                from_name=sender_info["from_name"] if sender_info else None,
                dkim=sender_info["dkim"] if sender_info else None,
                reply_to=campaign.reply_to,
                headers=unsubscribe_service.one_click_headers(unsub_url),
            )
        except Exception as e:
            db.add(
                Event(
                    organization_id=org_id,
                    campaign_id=campaign.id,
                    contact_id=contact.id,
                    type=EventType.FAILED,
                    extra={"error": customer_safe(str(e), log_prefix="campaign send")},
                )
            )
            continue

        db.add(
            Event(
                organization_id=org_id,
                campaign_id=campaign.id,
                contact_id=contact.id,
                type=EventType.SENT,
                extra={"message_id": message_id},
            )
        )
        emails_sent_this_month += 1
        daily_left -= 1

    campaign.status = CampaignStatus.CANCELLED if cancelled else CampaignStatus.SENT
    campaign.cancel_requested = False
    campaign.sent_at = datetime.now(timezone.utc)
    await db.commit()
    await email_event_service.evaluate_org_health(db, org_id)
    await db.refresh(campaign)
    from app.services import inbox  # noqa: PLC0415

    await inbox.notify(db, org_id, await inbox.recipients_with_permission(db, org_id, "email"), category="campaigns",
                       kind="campaign_cancelled" if cancelled else "campaign_sent",
                       title=f"Email campaign “{campaign.name}” {'was cancelled' if cancelled else 'finished sending'}",
                       body=f"{campaign.total_recipients or 0} recipients", link=f"/campaigns/{campaign.id}")
    return campaign


async def request_cancel(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    campaign = await get_campaign(db, org_id, campaign_id)
    if campaign.status != CampaignStatus.SENDING:
        raise CampaignNotSendingError(campaign_id)
    campaign.cancel_requested = True
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def get_email_connection_status(db: AsyncSession, org_id: uuid.UUID | None = None) -> dict:
    """Whether email can really be delivered — reports the real provider, never a simulation."""
    provider = await get_provider(db)
    if provider.configured:
        return {"connection_ok": True, "connection_note": "Email delivery is ready."}
    return {"connection_ok": False, "connection_note": NOT_CONFIGURED_MESSAGE}


async def campaign_precheck(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> dict:
    campaign = await get_campaign(db, org_id, campaign_id)
    segment = await db.scalar(select(Segment).where(Segment.id == campaign.segment_id))
    rules = [SegmentRule(**r) for r in segment.rules] if segment else []
    query = build_segment_query(org_id, rules, segment.match_type if segment else "all").where(
        Contact.email.isnot(None)
    )
    sub = query.subquery()
    recipient_count = await db.scalar(select(func.count()).select_from(sub)) or 0
    suppressed_now = await unsubscribe_service.suppressed_set(db, org_id)
    excluded_count = (await db.scalar(select(func.count()).select_from(sub).where(func.lower(sub.c.email).in_(suppressed_now))) or 0) if suppressed_now else 0
    sending_org = await db.get(Organization, org_id)
    compliance_warning = None if (sending_org and sending_org.address) else "Add your business address in Settings → Company Profile. It is shown at the bottom of every marketing email (required by anti-spam rules)."

    monthly_limit = await get_plan_limit(db, org_id, "emails_monthly_limit")
    emails_sent_this_month = await count_emails_this_month(db, org_id)
    free_remaining = -1 if monthly_limit == -1 else max(0, monthly_limit - emails_sent_this_month)
    billable_count = 0 if free_remaining == -1 else max(0, recipient_count - free_remaining)

    overage_rate = await get_credit_rate(db, "email_overage")
    rate_bdt_per_1000 = float(overage_rate.rate_bdt) if overage_rate else None
    per_email_paisa = max(1, int(overage_rate.rate_bdt * 100) // 1000) if overage_rate else 0
    estimated_cost_paisa = billable_count * per_email_paisa
    estimated_cost_bdt = estimated_cost_paisa / 100

    wallet_balance_paisa = await get_balance(db, org_id)
    wallet_balance_bdt = wallet_balance_paisa / 100
    sufficient_balance = wallet_balance_paisa >= estimated_cost_paisa

    connection = await get_email_connection_status(db, org_id)

    sender_info = await email_domain_service.resolve_sender(db, org_id, campaign.sender_id)
    sender_warning = None
    if sender_info and sender_info["domain_status"] == "paused":
        sender_warning = f"Sending is paused for {sender_info['domain']}: {sender_info['paused_reason']}"
    elif sender_info and sender_info["domain_status"] == "deleted":
        sender_warning = f"{sender_info['domain']} is in the trash — restore it before sending."
    elif sender_info and sender_info["domain_status"] != "verified":
        sender_warning = f"{sender_info['domain']} is not verified yet."
    daily_remaining = max(0, settings.email_daily_cap_per_org - await email_event_service.sent_today(db, org_id))
    if sender_warning is None and recipient_count > daily_remaining:
        sender_warning = f"Daily sending limit: only {daily_remaining} of {recipient_count} emails can go out today; the rest will be marked failed."

    return {
        "from_email": sender_info["from_email"] if sender_info else None,
        "sender_warning": sender_warning,
        "excluded_count": excluded_count,
        "compliance_warning": compliance_warning,
        "daily_remaining": daily_remaining,
        "recipient_count": recipient_count,
        "free_remaining": free_remaining,
        "billable_count": billable_count,
        "rate_bdt_per_1000": rate_bdt_per_1000,
        "estimated_cost_bdt": estimated_cost_bdt,
        "wallet_balance_bdt": wallet_balance_bdt,
        "sufficient_balance": sufficient_balance,
        **connection,
    }


async def list_campaign_events(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> dict:
    await get_campaign(db, org_id, campaign_id)  # raises CampaignNotFoundError if missing/foreign
    rows = await db.execute(
        select(Event, Contact.email)
        .outerjoin(Contact, Contact.id == Event.contact_id)
        .where(Event.campaign_id == campaign_id, Event.type.in_([EventType.SENT, EventType.FAILED]))
        .order_by(Event.occurred_at.desc())
    )
    sent: list[dict] = []
    failed: list[dict] = []
    for event, email in rows:
        entry = {
            "contact_id": event.contact_id,
            "email": email,
            "status": event.type.value,
            "error": (event.extra or {}).get("error"),
            "occurred_at": event.occurred_at,
        }
        (sent if event.type == EventType.SENT else failed).append(entry)
    return {"sent": sent, "failed": failed}


async def simulate_engagement(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> dict[str, int]:
    """Demo aid that fabricates open/click events — real ones arrive via
    our tracking pixel and the SES event webhook."""
    campaign = await get_campaign(db, org_id, campaign_id)
    sent_events = (
        await db.scalars(select(Event).where(Event.campaign_id == campaign.id, Event.type == EventType.SENT))
    ).all()

    opened = clicked = 0
    for event in sent_events:
        if random.random() < 0.6:
            db.add(
                Event(
                    organization_id=org_id,
                    campaign_id=campaign.id,
                    contact_id=event.contact_id,
                    type=EventType.OPENED,
                )
            )
            opened += 1
            if random.random() < 0.4:
                db.add(
                    Event(
                        organization_id=org_id,
                        campaign_id=campaign.id,
                        contact_id=event.contact_id,
                        type=EventType.CLICKED,
                    )
                )
                clicked += 1

    await db.commit()
    return {"opened": opened, "clicked": clicked}
