"""Turns delivery/engagement signals (our tracking pixel, SES via SNS, or a
generic webhook) into Event rows, maintains the suppression list, and pauses
domains whose bounce/complaint rates threaten the shared sending reputation."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.email_domain import EmailSuppression, SendingDomain
from app.models.enums import EventType
from app.models.event import Event


async def suppress(db: AsyncSession, org_id: uuid.UUID, email: str, reason: str) -> None:
    email = email.strip().lower()
    exists = await db.scalar(select(EmailSuppression.id).where(EmailSuppression.organization_id == org_id, EmailSuppression.email == email))
    if exists is None:
        db.add(EmailSuppression(organization_id=org_id, email=email, reason=reason))


async def suppressed_emails(db: AsyncSession, org_id: uuid.UUID) -> set[str]:
    rows = await db.scalars(select(EmailSuppression.email).where(EmailSuppression.organization_id == org_id))
    return {e.lower() for e in rows}


async def record_engagement(db: AsyncSession, campaign_id: uuid.UUID, contact_id: uuid.UUID, kind: EventType, extra: dict | None = None) -> bool:
    """Opens/clicks are recorded once per contact per campaign."""
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        return False
    exists = await db.scalar(
        select(Event.id).where(Event.campaign_id == campaign_id, Event.contact_id == contact_id, Event.type == kind)
    )
    if exists is not None:
        return False
    db.add(Event(organization_id=campaign.organization_id, campaign_id=campaign_id, contact_id=contact_id, type=kind, extra=extra))
    await db.commit()
    return True


async def _sent_event_by_message_id(db: AsyncSession, message_id: str) -> Event | None:
    return await db.scalar(
        select(Event).where(Event.type == EventType.SENT, Event.extra["message_id"].astext == message_id)
    )


async def record_provider_event(db: AsyncSession, kind: str, message_id: str, email: str | None = None, detail: str | None = None) -> bool:
    """kind: delivery | bounce | bounce_soft | complaint | open | click"""
    sent = await _sent_event_by_message_id(db, message_id)
    if sent is None:
        return False
    if kind in ("open", "click"):
        return await record_engagement(db, sent.campaign_id, sent.contact_id, EventType.OPENED if kind == "open" else EventType.CLICKED) if sent.contact_id else False
    if kind in ("bounce", "bounce_soft", "complaint"):
        db.add(Event(
            organization_id=sent.organization_id, campaign_id=sent.campaign_id, contact_id=sent.contact_id,
            type=EventType.BOUNCED, extra={"kind": kind, "detail": detail, "message_id": message_id},
        ))
        if kind in ("bounce", "complaint") and email:
            await suppress(db, sent.organization_id, email, "complaint" if kind == "complaint" else "bounce")
        await db.commit()
        await evaluate_org_health(db, sent.organization_id)
        return True
    return False


# SES event-publishing / notification payloads -> our kinds
def parse_ses_notification(payload: dict) -> list[tuple[str, str, str | None, str | None]]:
    """Returns [(kind, message_id, email, detail)]."""
    event_type = (payload.get("eventType") or payload.get("notificationType") or "").lower()
    mail = payload.get("mail", {})
    mid = mail.get("messageId")
    if not mid:
        return []
    out: list[tuple[str, str, str | None, str | None]] = []
    if event_type == "bounce":
        b = payload.get("bounce", {})
        kind = "bounce" if b.get("bounceType") == "Permanent" else "bounce_soft"
        for r in b.get("bouncedRecipients", []) or [{}]:
            out.append((kind, mid, r.get("emailAddress"), r.get("diagnosticCode") or b.get("bounceSubType")))
    elif event_type == "complaint":
        for r in payload.get("complaint", {}).get("complainedRecipients", []) or [{}]:
            out.append(("complaint", mid, r.get("emailAddress"), payload.get("complaint", {}).get("complaintFeedbackType")))
    elif event_type == "open":
        out.append(("open", mid, None, None))
    elif event_type == "click":
        out.append(("click", mid, None, payload.get("click", {}).get("link")))
    return out


async def evaluate_org_health(db: AsyncSession, org_id: uuid.UUID) -> str | None:
    """Pauses the org's verified domains when recent bounce/complaint rates are
    over the configured thresholds. Returns the pause reason if it paused."""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    kind_col = Event.extra["kind"].astext.label("kind")
    rows = await db.execute(
        select(Event.type, kind_col, func.count())
        .where(Event.organization_id == org_id, Event.occurred_at >= since,
               Event.type.in_([EventType.SENT, EventType.BOUNCED]))
        .group_by(Event.type, kind_col)
    )
    sent = bounced = complaints = 0
    for etype, kind, n in rows:
        if etype == EventType.SENT:
            sent += n
        elif kind == "complaint":
            complaints += n
        elif kind == "bounce":
            bounced += n
    if sent < settings.email_health_min_sample:
        return None
    reason = None
    if bounced / sent > settings.email_max_bounce_rate:
        reason = f"Bounce rate {bounced / sent:.1%} is above the {settings.email_max_bounce_rate:.0%} limit. Clean your contact list, then contact support to resume sending."
    elif complaints / sent > settings.email_max_complaint_rate:
        reason = f"Spam complaint rate {complaints / sent:.2%} is above the {settings.email_max_complaint_rate:.1%} limit. Contact support to resume sending."
    if reason:
        await db.execute(
            update(SendingDomain)
            .where(SendingDomain.organization_id == org_id, SendingDomain.status == "verified")
            .values(status="paused", paused_reason=reason)
        )
        await db.commit()
    return reason


async def sent_today(db: AsyncSession, org_id: uuid.UUID) -> int:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return await db.scalar(
        select(func.count(Event.id)).where(Event.organization_id == org_id, Event.type == EventType.SENT, Event.occurred_at >= start)
    ) or 0
