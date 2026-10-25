import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.integrations import sms_gateway, whatsapp_gateway
from app.integrations.meta_whatsapp import MetaWhatsAppError
from app.integrations.whatsapp_gateway import WhatsAppNotConnectedError
from app.integrations.sms_gateway import SmsGatewayError
from app.integrations.sslwireless import sslwireless_client
from app.models.contact import Contact
from app.models.enums import SmsChannel, SmsCampaignStatus, SmsEventType
from app.models.organization import Organization
from app.models.segment import Segment
from app.models.sms import SmsCampaign, SmsEvent, SmsInboundMessage, SmsSkipEvent
from app.models.wallet import WalletTransaction
from app.schemas.audience import SegmentRule
from app.services.audience_service import build_segment_query
from app.services import merge_tag_service
from app.services.personalize import personalize
from app.services.plan_service import get_credit_rate, get_org_plan
from app.services import sms_plan
from app.services.wallet_service import InsufficientBalanceError, deduct, refund


class SmsCampaignNotFoundError(Exception):
    pass


class SmsCampaignAlreadySentError(Exception):
    pass


class SegmentRequiredError(Exception):
    pass


_FALLBACK_SENDER_ID = "SENDER"


def derive_sender_id(org_name: str) -> str:
    """Derives a per-org default masking ID from the org name — each
    organization gets its own distinct value instead of sharing one
    platform-wide default (BTRC masking IDs are capped at 11 chars)."""
    slug = re.sub(r"[^A-Za-z0-9]", "", org_name).upper()
    return (slug or _FALLBACK_SENDER_ID)[:11]


# ── Campaign CRUD ─────────────────────────────────────────────────────────────


async def create_sms_campaign(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    name: str,
    segment_id: uuid.UUID,
    channel: SmsChannel,
    message_body: str,
    sender_id: str | None = None,
    wa_template: dict | None = None,
) -> SmsCampaign:
    segment = await db.scalar(
        select(Segment).where(Segment.organization_id == org_id, Segment.id == segment_id)
    )
    if segment is None:
        raise SegmentRequiredError(segment_id)

    if not sender_id:
        # Label only — the sender actually used is decided at send time
        # (resolve_effective_sender_id): the org's approved masking ID or the shared default.
        org = await db.get(Organization, org_id)
        sender_id = org.sms_sender_id if org and org.sms_sender_id and org.sms_sender_id_approved else "shared"

    campaign = SmsCampaign(
        organization_id=org_id,
        segment_id=segment_id,
        name=name,
        channel=channel,
        message_body=message_body,
        wa_template=wa_template,
        sender_id=sender_id,
        status=SmsCampaignStatus.DRAFT,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


# ── Org-level masking sender ID ───────────────────────────────────────────────


async def get_org_sms_settings(db: AsyncSession, org_id: uuid.UUID) -> tuple[str | None, str, bool]:
    """Returns (requested sender_id or None, suggested default derived from
    org name, whether the requested sender_id is approved for live sending)."""
    org = await db.get(Organization, org_id)
    if org is None:
        return None, _FALLBACK_SENDER_ID, False
    return org.sms_sender_id, derive_sender_id(org.name), org.sms_sender_id_approved


async def get_sms_masking_setup_fee_bdt(db: AsyncSession) -> float:
    rate = await get_credit_rate(db, "sms_masking_setup")
    return float(rate.rate_bdt) if rate else 0.0


async def update_org_sms_sender_id(
    db: AsyncSession, org_id: uuid.UUID, sender_id: str | None
) -> str | None:
    """Org self-service: propose a desired Sender ID. This does NOT grant
    approval — a platform admin must confirm BTRC/aggregator approval via
    admin_set_org_sms_sender before it's used for live sending.

    Requesting a new (non-empty, changed) Sender ID charges the org's wallet
    the one-time sms_masking_setup fee, covering BTRC/aggregator processing —
    clearing a Sender ID or re-saving the same value is free. Raises
    InsufficientBalanceError (propagated from wallet_service.deduct) if the
    org can't cover it; caller should surface that as 402."""
    org = await db.get(Organization, org_id)
    if org is None:
        raise ValueError(f"Organization {org_id} not found")

    new_value = sender_id or None
    if new_value == org.sms_sender_id:
        return org.sms_sender_id

    if new_value:
        rate = await get_credit_rate(db, "sms_masking_setup")
        if rate is not None and rate.rate_bdt > 0:  # a fee of 0 means the setup is free — no transaction at all
            cost_paisa = int(rate.rate_bdt * 100)
            await deduct(
                db,
                org_id,
                cost_paisa,
                service="sms_masking_setup",
                units=1,
                reference_id=str(org_id),
                note=f"Sender ID request: {new_value}",
            )

    org.sms_sender_id = new_value
    org.sms_sender_id_approved = False
    await db.commit()
    return org.sms_sender_id


async def admin_set_org_sms_sender(
    db: AsyncSession, org_id: uuid.UUID, *, sender_id: str | None, approved: bool
) -> Organization:
    """Platform-admin-only: assign/confirm an org's Sender ID after verifying
    approval with the aggregator directly (BTRC masking approval can't be
    self-certified by tenants)."""
    org = await db.get(Organization, org_id)
    if org is None:
        raise ValueError(f"Organization {org_id} not found")
    org.sms_sender_id = sender_id or None
    org.sms_sender_id_approved = approved
    await db.commit()
    await db.refresh(org)
    return org


async def resolve_effective_sender_id(db: AsyncSession, org_id: uuid.UUID) -> str | None:
    """The Sender ID used for live sending: the org's own masking ID when it is
    approved AND its plan allows masking; otherwise None, meaning the gateway's
    shared default sender (set by the platform admin)."""
    org = await db.get(Organization, org_id)
    if org and org.sms_sender_id_approved and org.sms_sender_id:
        plan = await get_org_plan(db, org_id)
        if plan and plan.masking_allowed:
            return org.sms_sender_id
    return None


async def get_sms_campaign(db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID) -> SmsCampaign:
    campaign = await db.scalar(
        select(SmsCampaign).where(
            SmsCampaign.organization_id == org_id, SmsCampaign.id == campaign_id
        )
    )
    if campaign is None:
        raise SmsCampaignNotFoundError(campaign_id)
    return campaign


async def list_sms_campaigns(db: AsyncSession, org_id: uuid.UUID) -> list[SmsCampaign]:
    result = await db.scalars(
        select(SmsCampaign)
        .where(SmsCampaign.organization_id == org_id)
        .order_by(SmsCampaign.created_at.desc())
    )
    return list(result)


async def event_counts(db: AsyncSession, campaign_id: uuid.UUID) -> dict[str, int]:
    sent = await db.scalar(
        select(func.count())
        .select_from(SmsEvent)
        .where(SmsEvent.sms_campaign_id == campaign_id, SmsEvent.type == SmsEventType.SENT)
    ) or 0
    failed = await db.scalar(
        select(func.count())
        .select_from(SmsEvent)
        .where(SmsEvent.sms_campaign_id == campaign_id, SmsEvent.type == SmsEventType.FAILED)
    ) or 0
    skipped = await db.scalar(
        select(func.count())
        .select_from(SmsSkipEvent)
        .where(SmsSkipEvent.sms_campaign_id == campaign_id)
    ) or 0
    return {"sent": sent, "failed": failed, "skipped": skipped}


# ── Send history / campaign drill-down / dashboard ────────────────────────────


async def list_campaign_events(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID
) -> tuple[list[tuple[SmsEvent, str]], list[tuple[SmsSkipEvent, str]]]:
    """Returns (sent_and_failed events, skipped events) for one campaign, each
    paired with the campaign name, most recent first."""
    campaign = await get_sms_campaign(db, org_id, campaign_id)
    events = (
        await db.scalars(
            select(SmsEvent)
            .where(SmsEvent.sms_campaign_id == campaign_id)
            .order_by(SmsEvent.occurred_at.desc())
        )
    ).all()
    skips = (
        await db.scalars(
            select(SmsSkipEvent)
            .where(SmsSkipEvent.sms_campaign_id == campaign_id)
            .order_by(SmsSkipEvent.occurred_at.desc())
        )
    ).all()
    return [(e, campaign.name) for e in events], [(s, campaign.name) for s in skips]


async def list_sms_history(db: AsyncSession, org_id: uuid.UUID, limit: int = 200) -> list[tuple[SmsEvent, str]]:
    """Send history across all campaigns, most recent first."""
    rows = await db.execute(
        select(SmsEvent, SmsCampaign.name)
        .join(SmsCampaign, SmsCampaign.id == SmsEvent.sms_campaign_id)
        .where(SmsEvent.organization_id == org_id)
        .order_by(SmsEvent.occurred_at.desc())
        .limit(limit)
    )
    return [(event, name) for event, name in rows.all()]


async def list_inbound_messages(
    db: AsyncSession, org_id: uuid.UUID, limit: int = 200
) -> list[SmsInboundMessage]:
    result = await db.scalars(
        select(SmsInboundMessage)
        .where(SmsInboundMessage.organization_id == org_id)
        .order_by(SmsInboundMessage.received_at.desc())
        .limit(limit)
    )
    return list(result)


async def record_inbound_sms(
    db: AsyncSession, *, from_phone: str, to_sender_id: str | None, body: str
) -> SmsInboundMessage:
    """Ingests one inbound (MO) SMS from the SSL Wireless webhook.

    The aggregator's payload doesn't carry a tenant identifier, so the
    organization is inferred from the most recent outbound SMS we sent to
    this phone number — works uniformly whether the org used its own
    approved masking ID or the shared platform non-masking default."""
    last_sent = await db.scalar(
        select(SmsEvent)
        .where(SmsEvent.phone == from_phone, SmsEvent.type == SmsEventType.SENT)
        .order_by(SmsEvent.occurred_at.desc())
        .limit(1)
    )
    org_id = last_sent.organization_id if last_sent else None

    contact_id = None
    if org_id is not None:
        contact = await db.scalar(
            select(Contact).where(Contact.organization_id == org_id, Contact.phone == from_phone)
        )
        contact_id = contact.id if contact else None

    inbound = SmsInboundMessage(
        organization_id=org_id,
        contact_id=contact_id,
        from_phone=from_phone,
        to_sender_id=to_sender_id,
        body=body,
    )
    db.add(inbound)
    await db.commit()
    await db.refresh(inbound)
    return inbound


async def get_sms_dashboard(db: AsyncSession, org_id: uuid.UUID) -> dict:
    campaigns = await list_sms_campaigns(db, org_id)
    campaigns_by_status: dict[str, int] = {}
    for c in campaigns:
        campaigns_by_status[c.status.value] = campaigns_by_status.get(c.status.value, 0) + 1

    total_sent = await db.scalar(
        select(func.count())
        .select_from(SmsEvent)
        .where(SmsEvent.organization_id == org_id, SmsEvent.type == SmsEventType.SENT)
    ) or 0
    total_failed = await db.scalar(
        select(func.count())
        .select_from(SmsEvent)
        .where(SmsEvent.organization_id == org_id, SmsEvent.type == SmsEventType.FAILED)
    ) or 0
    total_skipped = await db.scalar(
        select(func.count())
        .select_from(SmsSkipEvent)
        .where(SmsSkipEvent.organization_id == org_id)
    ) or 0
    total_inbound = await db.scalar(
        select(func.count())
        .select_from(SmsInboundMessage)
        .where(SmsInboundMessage.organization_id == org_id)
    ) or 0

    async def _credits_spent(service: str) -> float:
        paisa = await db.scalar(
            select(func.coalesce(func.sum(-WalletTransaction.amount_paisa), 0)).where(
                WalletTransaction.organization_id == org_id,
                WalletTransaction.type == "deduction",
                WalletTransaction.service == service,
            )
        ) or 0
        return paisa / 100

    sender_id, _, approved = await get_org_sms_settings(db, org_id)

    return {
        "total_campaigns": len(campaigns),
        "campaigns_by_status": campaigns_by_status,
        "total_sent": total_sent,
        "total_failed": total_failed,
        "total_skipped": total_skipped,
        "total_inbound": total_inbound,
        "sms_credits_spent_bdt": await _credits_spent("sms"),
        "whatsapp_credits_spent_bdt": await _credits_spent("whatsapp"),
        "sender_id": sender_id,
        "sender_id_approved": approved,
    }


# ── Send pipeline (fast API half + slow Celery half) ─────────────────────────


async def mark_sms_campaign_sending(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID
) -> SmsCampaign:
    campaign = await get_sms_campaign(db, org_id, campaign_id)
    if campaign.status != SmsCampaignStatus.DRAFT:
        raise SmsCampaignAlreadySentError(campaign_id)
    campaign.status = SmsCampaignStatus.SENDING
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def send_sms_campaign(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID
) -> SmsCampaign:
    """Actual sending — called from Celery task, never inline in the API.

    Opt-in enforcement:
    - contacts WITHOUT the relevant opt-in flag are recorded in sms_skip_events
      (provably excluded) but never sent a message.
    - only contacts WITH the flag AND a phone number are sent to.
    """
    campaign = await get_sms_campaign(db, org_id, campaign_id)
    if campaign.status != SmsCampaignStatus.SENDING:
        raise SmsCampaignAlreadySentError(campaign_id)

    segment = await db.scalar(select(Segment).where(Segment.id == campaign.segment_id))
    rules = [SegmentRule(**r) for r in segment.rules]
    # Get all contacts in segment that have a phone number.
    query = build_segment_query(org_id, rules, segment.match_type).where(Contact.phone.isnot(None))
    contacts = (await db.scalars(query)).all()

    service_name = "sms" if campaign.channel == SmsChannel.SMS else "whatsapp"
    is_whatsapp = campaign.channel == SmsChannel.WHATSAPP
    if is_whatsapp:
        # Failsafe: never charge or "send" when WhatsApp isn't actually connected (the send route checks too).
        ok, _why = await whatsapp_gateway.availability(db, org_id)
        if not ok:
            campaign.status = SmsCampaignStatus.FAILED
            await db.commit()
            return campaign
    rate = await get_credit_rate(db, service_name)
    if rate is None:
        raise RuntimeError(f"{service_name} credit rate not configured")
    cost_paisa = int(rate.rate_bdt * 100)

    effective_sender_id = await resolve_effective_sender_id(db, org_id)
    custom_tags = await merge_tag_service.merge_tag_values(db, org_id)
    ent = await sms_plan.entitlement(db, org_id)
    # Hard stop for the plan's monthly SMS cap, even if the segment grew since the pre-check.
    plan_left = ent["remaining"] if campaign.channel == SmsChannel.SMS else ent["whatsapp_remaining"]
    # Customers on their own Meta account pay Meta directly: no wallet credit is taken for them.
    uses_own_account = is_whatsapp and await whatsapp_gateway.own_creds(db, org_id) is not None
    # The shared platform number has one quality rating for everyone, so each customer gets a daily cap on it.
    daily_left = None
    if is_whatsapp and not uses_own_account:
        sent_today = await db.scalar(
            select(func.count(SmsEvent.id)).join(SmsCampaign, SmsCampaign.id == SmsEvent.sms_campaign_id).where(
                SmsEvent.organization_id == org_id, SmsEvent.type == SmsEventType.SENT, SmsCampaign.channel == SmsChannel.WHATSAPP,
                SmsEvent.occurred_at >= datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0))) or 0
        daily_left = max(0, settings.whatsapp_daily_cap_per_org - sent_today)

    attempted = 0
    balance_failures = 0

    for contact in contacts:
        opted_in = bool(
            contact.sms_opt_in
            if campaign.channel == SmsChannel.SMS
            else contact.whatsapp_opt_in
        )

        if not opted_in:
            # Provably excluded — write a skip record, do not call the gateway.
            db.add(
                SmsSkipEvent(
                    organization_id=org_id,
                    sms_campaign_id=campaign.id,
                    contact_id=contact.id,
                    phone=contact.phone,
                )
            )
            continue

        if plan_left is not None and plan_left <= 0:
            db.add(SmsEvent(organization_id=org_id, sms_campaign_id=campaign.id, contact_id=contact.id, phone=contact.phone,
                            type=SmsEventType.FAILED, error=f"Plan monthly {'WhatsApp' if is_whatsapp else 'SMS'} limit reached"))
            continue
        if daily_left is not None and daily_left <= 0:
            db.add(SmsEvent(organization_id=org_id, sms_campaign_id=campaign.id, contact_id=contact.id, phone=contact.phone,
                            type=SmsEventType.FAILED, error=f"Daily WhatsApp limit ({settings.whatsapp_daily_cap_per_org:,}) reached — try again tomorrow"))
            continue

        attempted += 1

        try:
            # Deduct and commit BEFORE sending — avoids double-charging on retry.
            if not uses_own_account:
                await deduct(db, org_id, cost_paisa, service=service_name, units=1, reference_id=str(campaign.id))
                await db.commit()
        except InsufficientBalanceError:
            balance_failures += 1
            db.add(
                SmsEvent(
                    organization_id=org_id,
                    sms_campaign_id=campaign.id,
                    contact_id=contact.id,
                    phone=contact.phone,
                    type=SmsEventType.FAILED,
                    error="Not enough wallet balance",
                )
            )
            continue

        try:
            if campaign.channel == SmsChannel.SMS:
                gw_id = await sms_gateway.send_sms(
                    db, to=contact.phone, message=personalize(campaign.message_body, contact, custom_tags, escape=False), sender_id=effective_sender_id
                )
                if plan_left is not None:
                    plan_left -= 1
            else:
                tpl = campaign.wa_template
                if tpl:
                    tpl = {**tpl, "params": [personalize(p, contact, custom_tags, escape=False) for p in tpl.get("params") or []]}
                gw_id = await whatsapp_gateway.send_whatsapp(
                    db, org_id=org_id, to=contact.phone, template=tpl,
                    message=personalize(campaign.message_body, contact, custom_tags, escape=False),
                )
                if plan_left is not None:
                    plan_left -= 1
                if daily_left is not None:
                    daily_left -= 1
            db.add(
                SmsEvent(
                    organization_id=org_id,
                    sms_campaign_id=campaign.id,
                    contact_id=contact.id,
                    phone=contact.phone,
                    type=SmsEventType.SENT,
                    gateway_message_id=gw_id,
                )
            )
        except Exception as e:
            reason = str(e) if isinstance(e, (SmsGatewayError, MetaWhatsAppError, WhatsAppNotConnectedError, ValueError)) else "Could not send (gateway error)"
            db.add(
                SmsEvent(
                    organization_id=org_id,
                    sms_campaign_id=campaign.id,
                    contact_id=contact.id,
                    phone=contact.phone,
                    type=SmsEventType.FAILED,
                    error=reason[:255],
                )
            )
            # The message never left — give the customer their credit back.
            if not uses_own_account:
                await refund(db, org_id, cost_paisa, service=service_name, reference_id=str(campaign.id), note=f"Refund: {reason[:120]}")
            await db.commit()

    # If more than half the attempted sends failed for lack of balance, the
    # campaign as a whole didn't get through — surface that instead of SENT.
    campaign.status = (
        SmsCampaignStatus.FAILED
        if attempted > 0 and balance_failures / attempted > 0.5
        else SmsCampaignStatus.SENT
    )
    campaign.sent_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(campaign)
    from app.services import inbox  # noqa: PLC0415

    failed = campaign.status == SmsCampaignStatus.FAILED
    await inbox.notify(db, org_id, await inbox.recipients_with_permission(db, org_id, "sms"), category="campaigns",
                       kind="campaign_failed" if failed else "campaign_sent",
                       title=f"SMS campaign “{campaign.name}” " + ("failed — not enough wallet balance" if failed else "finished sending"),
                       link=f"/sms/campaigns/{campaign.id}")
    return campaign


# ── Opt-in management ─────────────────────────────────────────────────────────


async def update_contact_opt_in(
    db: AsyncSession,
    org_id: uuid.UUID,
    contact_id: uuid.UUID,
    *,
    sms_opt_in: bool | None = None,
    whatsapp_opt_in: bool | None = None,
    user_id: uuid.UUID | None = None,
) -> Contact:
    from app.services.crm_sales_service import log_consent  # noqa: PLC0415

    contact = await db.scalar(
        select(Contact).where(Contact.organization_id == org_id, Contact.id == contact_id)
    )
    if contact is None:
        raise ValueError(f"Contact {contact_id} not found")
    if sms_opt_in is not None and sms_opt_in != contact.sms_opt_in:
        contact.sms_opt_in = sms_opt_in
        log_consent(db, org_id, contact.id, "sms", sms_opt_in, "manual", user_id)
    if whatsapp_opt_in is not None and whatsapp_opt_in != contact.whatsapp_opt_in:
        contact.whatsapp_opt_in = whatsapp_opt_in
        log_consent(db, org_id, contact.id, "whatsapp", whatsapp_opt_in, "manual", user_id)
    await db.commit()
    await db.refresh(contact)
    return contact
