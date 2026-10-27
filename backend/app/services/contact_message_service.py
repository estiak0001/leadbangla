"""One-off email/SMS sent to a single contact from their detail page — the
org's own content, through the org's own verified sender / SMS gateway and
wallet. Distinct from bulk Campaigns (no segment, no campaign row) but logged
to the contact's activity timeline so it's visible there.

This is customer-controlled content — unlike the admin-only internal
templates in email_template_service.py, nothing here is editable by staff."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import sms_gateway
from app.integrations.email_client import email_client
from app.integrations.email_delivery import EmailSendError, customer_safe
from app.integrations.sms_gateway import SmsGatewayError
from app.models.contact import Contact
from app.models.email_domain import EmailSuppression
from app.services import crm_service
from app.services.email_domain_service import resolve_sender
from app.services.plan_service import get_credit_rate
from app.services.sms_service import resolve_effective_sender_id
from app.services.wallet_service import InsufficientBalanceError, deduct, refund


class ContactMessageError(Exception):
    pass


async def _get_contact(db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID) -> Contact:
    contact = await db.get(Contact, contact_id)
    if contact is None or contact.organization_id != org_id or contact.deleted_at is not None:
        raise ContactMessageError("Contact not found")
    return contact


async def send_direct_email(
    db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID, sender_id: uuid.UUID,
    subject: str, body_html: str, user_id: uuid.UUID | None,
) -> dict:
    contact = await _get_contact(db, org_id, contact_id)
    if not contact.email:
        raise ContactMessageError("This contact has no email address")

    suppressed = await db.scalar(
        select(EmailSuppression).where(EmailSuppression.organization_id == org_id, EmailSuppression.email == contact.email)
    )
    if suppressed:
        raise ContactMessageError("This address has bounced or unsubscribed and can't be emailed")

    info = await resolve_sender(db, org_id, sender_id)
    if info is None:
        raise ContactMessageError("Sender not found")
    if info["domain_status"] != "verified":
        raise ContactMessageError(
            "This sender's domain is not verified yet — verify its DNS records first." if info["domain_status"] == "pending"
            else f"Sending is paused: {info['paused_reason']}"
        )

    try:
        await email_client.send_email(
            db, org_id=org_id, to_email=contact.email, subject=subject, html_body=body_html,
            from_email=info["from_email"], from_name=info["from_name"], dkim=info["dkim"],
        )
    except EmailSendError as e:
        raise ContactMessageError(customer_safe(str(e), log_prefix="direct email"))

    await crm_service.log_activity(db, org_id, contact.id, "email", f"Emailed: {subject}", user_id)
    await db.commit()
    return {"ok": True}


async def send_direct_sms(
    db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID, body: str, user_id: uuid.UUID | None,
) -> dict:
    contact = await _get_contact(db, org_id, contact_id)
    if not contact.phone:
        raise ContactMessageError("This contact has no phone number")
    if not contact.sms_opt_in:
        raise ContactMessageError("This contact hasn't opted in to SMS")

    rate = await get_credit_rate(db, "sms")
    if rate is None:
        raise ContactMessageError("SMS isn't set up on this account yet")
    cost_paisa = int(rate.rate_bdt * 100)
    sender = await resolve_effective_sender_id(db, org_id)

    try:
        await deduct(db, org_id, cost_paisa, service="sms", units=1, reference_id=str(contact.id))
        await db.commit()
    except InsufficientBalanceError:
        raise ContactMessageError("Not enough wallet balance to send this SMS")

    try:
        await sms_gateway.send_sms(db, to=contact.phone, message=body, sender_id=sender)
    except Exception as e:
        reason = str(e) if isinstance(e, SmsGatewayError) else "Could not send (gateway error)"
        await refund(db, org_id, cost_paisa, service="sms", reference_id=str(contact.id), note=f"Refund: {reason[:120]}")
        await db.commit()
        raise ContactMessageError(reason)

    await crm_service.log_activity(db, org_id, contact.id, "sms", f"Texted: {body[:80]}", user_id)
    await db.commit()
    return {"ok": True}
