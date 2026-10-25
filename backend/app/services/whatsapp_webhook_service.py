"""Handles Meta's WhatsApp webhook: delivery receipts and customers replying STOP."""
import hmac
import logging
import uuid
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds
from app.integrations.meta_whatsapp import ERRORS
from app.models.contact import Contact
from app.models.enums import SmsEventType
from app.models.platform_service import PlatformService
from app.models.sms import SmsCampaign, SmsEvent
from app.services.crm_sales_service import log_consent

log = logging.getLogger(__name__)
STOP_WORDS = {"stop", "unsubscribe", "cancel", "optout", "opt out", "বন্ধ", "বন্ধ করুন"}


async def stored_creds(db: AsyncSession) -> dict:
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == "meta_whatsapp"))
    return decrypt_creds(svc.credentials_enc) if svc and svc.credentials_enc else {}


async def org_creds(db: AsyncSession, key: str) -> dict:
    from app.models.organization import Organization  # noqa: PLC0415

    org = await db.scalar(select(Organization).where(Organization.whatsapp_webhook_key == key))
    return decrypt_creds(org.whatsapp_meta_enc) if org and org.whatsapp_meta_enc else {}


def valid_signature(app_secret: str, raw: bytes, header: str | None) -> bool:
    if not app_secret or not header or not header.startswith("sha256="):
        return False
    return hmac.compare_digest("sha256=" + hmac.new(app_secret.encode(), raw, sha256).hexdigest(), header)


def phone_variants(wa_number: str) -> list[str]:
    d = "".join(ch for ch in wa_number if ch.isdigit())
    local = "0" + d[3:] if d.startswith("880") else d
    return list({d, "+" + d, local})


async def handle(db: AsyncSession, payload: dict) -> None:
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value") or {}
            if change.get("field") == "message_template_status_update":
                from app.services import whatsapp_template_service as wts  # noqa: PLC0415

                await wts.apply_meta_status(db, meta_name=value.get("message_template_name"), template_id=str(value.get("message_template_id") or "") or None,
                                            event=value.get("event", ""), reason=value.get("reason"))
                continue
            for st in value.get("statuses", []):
                await _status(db, st)
            for msg in value.get("messages", []):
                await _inbound(db, msg)
    await db.commit()


async def _status(db: AsyncSession, st: dict) -> None:
    status, mid = st.get("status"), st.get("id")
    if status not in ("delivered", "read", "failed") or not mid:
        return
    sent = await db.scalar(select(SmsEvent).where(SmsEvent.gateway_message_id == mid, SmsEvent.type == SmsEventType.SENT))
    if sent is None:
        return
    kind = SmsEventType.FAILED if status == "failed" else SmsEventType.DELIVERED
    already = await db.scalar(select(SmsEvent.id).where(SmsEvent.gateway_message_id == mid, SmsEvent.type == kind))
    if already:
        return
    err = None
    if kind == SmsEventType.FAILED:
        e = (st.get("errors") or [{}])[0]
        err = (ERRORS.get(e.get("code")) or e.get("title") or "WhatsApp could not deliver this message")[:255]
    db.add(SmsEvent(organization_id=sent.organization_id, sms_campaign_id=sent.sms_campaign_id, contact_id=sent.contact_id,
                    phone=sent.phone, type=kind, gateway_message_id=mid, error=err))


async def _inbound(db: AsyncSession, msg: dict) -> None:
    text = ((msg.get("text") or {}).get("body") or (msg.get("button") or {}).get("text") or "").strip().lower()
    if text not in STOP_WORDS or not msg.get("from"):
        return
    variants = phone_variants(msg["from"])
    # Only customers that actually messaged this person on WhatsApp are affected.
    org_ids = set((await db.scalars(
        select(SmsEvent.organization_id).join(SmsCampaign, SmsCampaign.id == SmsEvent.sms_campaign_id)
        .where(SmsEvent.phone.in_(variants), SmsCampaign.channel == "whatsapp").distinct())).all())
    for org_id in org_ids:
        for c in (await db.scalars(select(Contact).where(Contact.organization_id == org_id, Contact.phone.in_(variants), Contact.whatsapp_opt_in.is_(True)))).all():
            c.whatsapp_opt_in = False
            log_consent(db, org_id, c.id, "whatsapp", False, "inbound_stop")
            log.info("WhatsApp STOP: contact %s opted out", c.id)
