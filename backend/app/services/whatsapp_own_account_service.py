"""A customer connecting their own Meta WhatsApp account: they keep their number and pay Meta directly.
The platform still approves the connection (same queue as any WhatsApp number)."""
import re
import secrets
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.integrations import meta_whatsapp as meta
from app.models.organization import Organization
from app.services import verification_service as vs


class OwnAccountError(Exception):
    pass


def _saved(org: Organization) -> dict:
    return decrypt_creds(org.whatsapp_meta_enc) if org.whatsapp_meta_enc else {}


async def status(db: AsyncSession, org_id: uuid.UUID) -> dict:
    org = await db.get(Organization, org_id)
    c = _saved(org)
    from app.services.whatsapp_health_service import health_map  # noqa: PLC0415

    health = (await health_map(db)).get(str(org_id)) if c else None
    return {"health": health, "connected": bool(c.get("access_token")), "number": org.whatsapp_number if c else None, "approved": bool(c) and org.whatsapp_number_approved,
            "phone_number_id": c.get("phone_number_id"), "waba_id": c.get("waba_id"), "verified_name": c.get("verified_name"), "quality": c.get("quality"),
            "has_app_secret": bool(c.get("app_secret")), "webhook_key": org.whatsapp_webhook_key if c else None}


async def connect(db: AsyncSession, org_id: uuid.UUID, *, access_token: str | None, phone_number_id: str, waba_id: str | None,
                  app_secret: str | None, verify_token: str | None) -> dict:
    org = await db.get(Organization, org_id)
    old = _saved(org)
    creds = {
        "access_token": (access_token or "").strip() or old.get("access_token", ""),
        "phone_number_id": phone_number_id.strip(), "waba_id": (waba_id or "").strip(),
        "app_secret": (app_secret or "").strip() or old.get("app_secret", ""),
        "verify_token": (verify_token or "").strip() or old.get("verify_token", "") or secrets.token_urlsafe(12),
    }
    if not creds["access_token"]:
        raise OwnAccountError("Paste your Meta access token.")
    if not re.fullmatch(r"\d{5,40}", creds["phone_number_id"]):
        raise OwnAccountError("The phone number ID is digits only. Copy it from Meta → WhatsApp → API setup (it is not the phone number).")
    try:
        info = await meta.phone_info(creds)         # proves the token and ID belong together
    except meta.MetaWhatsAppError as e:
        raise OwnAccountError(str(e)) from e
    digits = re.sub(r"\D", "", info.get("display_phone_number", ""))
    if not digits:
        raise OwnAccountError("Meta didn't return a phone number for that ID.")
    creds["verified_name"], creds["quality"] = info.get("verified_name"), info.get("quality_rating")
    number = "+" + digits
    changed = number != org.whatsapp_number or creds["phone_number_id"] != old.get("phone_number_id")
    org.whatsapp_meta_enc = encrypt_creds(creds)
    org.whatsapp_webhook_key = org.whatsapp_webhook_key or secrets.token_urlsafe(16)
    org.whatsapp_number = number
    if changed or not old:
        org.whatsapp_number_approved = False      # a new number needs the platform's approval again
    await db.commit()
    if not org.whatsapp_number_approved:
        # Same approval queue as any WhatsApp number, so the platform can check the business before it sends.
        await vs.create_request(db, org_id, "whatsapp_number", number, f"Own Meta account · {info.get('verified_name') or 'unverified name'} · quality {info.get('quality_rating') or 'unknown'}")
    return await status(db, org_id)


async def disconnect(db: AsyncSession, org_id: uuid.UUID) -> dict:
    org = await db.get(Organization, org_id)
    org.whatsapp_meta_enc, org.whatsapp_number, org.whatsapp_number_approved = None, None, False
    await db.commit()
    return await status(db, org_id)
