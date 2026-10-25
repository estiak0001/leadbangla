import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds
from app.core.config import settings
from app.models.platform_service import PlatformService


async def get_live_creds(db: AsyncSession, code: str) -> dict | None:
    """Returns decrypted credentials if the service is enabled, live, and has
    stored credentials. Falls back to env vars for the services that were
    configurable that way before platform_services existed, so nothing
    breaks for deployments that haven't gone through the admin UI yet."""
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc and svc.is_enabled and svc.is_live and svc.credentials_enc:
        return decrypt_creds(svc.credentials_enc)
    return _env_fallback(code)


def _env_fallback(code: str) -> dict | None:
    if code == "sslwireless" and not settings.sslwireless_is_fake:
        # Connection credential only — Sender IDs are resolved separately per
        # org (see sms_service.resolve_effective_sender_id), not stored here.
        return {"api_token": settings.sslwireless_api_token}
    if code == "sslcommerz" and not settings.sslcommerz_is_fake:
        return {
            "store_id": settings.sslcommerz_store_id,
            "store_password": settings.sslcommerz_store_password,
            "sandbox_base_url": settings.sslcommerz_sandbox_base_url,
        }
    return None
