"""Per-integration credential helpers for the admin's dedicated integration pages:
saved values are shown masked, and saving MERGES (a blank secret keeps the stored one)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.models.platform_service import PlatformService
from app.models.user import User

router = APIRouter(prefix="/admin/integrations", tags=["admin"])

# Keys whose values must never be sent back in full. (webhook_secret is deliberately not here:
# staff paste it into SNS subscription URLs, so they must be able to read it.)
SECRET_KEYS = {
    "secret_access_key", "store_password", "api_token", "api_key", "api_secret", "access_token",
    "bearer_token", "vapid_private_key", "password", "app_secret", "verify_token", "client_secret",
}


def _mask(v: str) -> str:
    return "•" * len(v) if len(v) <= 6 else f"{v[:3]}{'•' * 6}{v[-3:]}"


async def _svc(db: AsyncSession, code: str) -> PlatformService:
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    return svc


def _fields(svc: PlatformService) -> dict:
    creds = decrypt_creds(svc.credentials_enc) if svc.credentials_enc else {}
    return {k: {"is_set": bool(v), "secret": k in SECRET_KEYS, "preview": _mask(v) if k in SECRET_KEYS else v} for k, v in creds.items()}


@router.get("/{code}/fields")
async def saved_fields(code: str, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """What is saved for this integration: plain values, secrets masked."""
    return _fields(await _svc(db, code))


@router.get("/amazon_ses/webhook-urls")
async def ses_webhook_urls(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Ready-to-paste SNS subscription endpoints (staff only; they embed the shared webhook secret)."""
    from app.services.email_provider_service import public_api_base, webhook_secret  # noqa: PLC0415
    base, secret = (await public_api_base(db)).rstrip("/"), await webhook_secret(db)
    return {
        "inbound": f"{base}/v1/public/mail/inbound?secret={secret}",
        "events": f"{base}/v1/public/email/events?secret={secret}",
    }


class CredentialsBody(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)
    required: list[str] = Field(default_factory=list)


@router.put("/{code}/credentials")
async def save_merged(code: str, body: CredentialsBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    svc = await _svc(db, code)
    merged = decrypt_creds(svc.credentials_enc) if svc.credentials_enc else {}
    for key, raw in body.values.items():
        v = (raw or "").strip()
        if v:
            merged[key] = v
        elif key not in SECRET_KEYS:
            merged.pop(key, None)  # an emptied plain field is cleared; an empty secret keeps its value
    missing = [k for k in body.required if not merged.get(k)]
    if missing:
        raise HTTPException(status_code=400, detail="Fill in: " + ", ".join(missing))
    svc.credentials_enc = encrypt_creds(merged)
    if code == "sslcommerz":
        svc.is_enabled = True  # configured now, so the online payment option switches on
    svc.last_tested_at, svc.last_test_ok, svc.last_test_error = None, None, None  # new credentials must be re-tested
    if not all(merged.get(k) for k in body.required):
        svc.is_live = False
    await db.commit()
    return _fields(svc)


@router.post("/firebase_vapid/generate-keys")
async def generate_push_keys(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Make a fresh VAPID key pair for the whole platform and save it (the subject is kept if already set)."""
    from sqlalchemy import func  # noqa: PLC0415

    from app.models.push import PushToken  # noqa: PLC0415
    from app.services.push_service import generate_vapid_keys  # noqa: PLC0415

    svc = await _svc(db, "firebase_vapid")
    merged = decrypt_creds(svc.credentials_enc) if svc.credentials_enc else {}
    replacing = bool(merged.get("vapid_private_key"))
    pub, priv = generate_vapid_keys()
    merged["vapid_public_key"], merged["vapid_private_key"] = pub, priv
    merged.setdefault("vapid_subject", "mailto:admin@leadbangla.com")
    svc.credentials_enc = encrypt_creds(merged)
    svc.last_tested_at, svc.last_test_ok, svc.last_test_error = None, None, None
    subscribers = await db.scalar(select(func.count(PushToken.id))) or 0
    await db.commit()
    return {"fields": _fields(svc), "replaced": replacing, "subscribers": subscribers}
