"""Which ways a customer can pay: the online gateway (SSLCommerz) and/or manual transfer."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds
from app.core.service_creds import get_live_creds
from app.models.platform_service import PlatformService

MANUAL_CODE = "manual_payment"
METHOD_LABELS = {"bkash": "bKash", "nagad": "Nagad", "rocket": "Rocket", "bank": "Bank transfer"}
ACCOUNT_KEYS = ("bkash", "nagad", "rocket", "bank")


async def _service(db: AsyncSession, code: str) -> PlatformService | None:
    return await db.scalar(select(PlatformService).where(PlatformService.code == code))


async def manual_accounts(db: AsyncSession) -> dict:
    svc = await _service(db, MANUAL_CODE)
    return decrypt_creds(svc.credentials_enc) if svc and svc.credentials_enc else {}


async def get_options(db: AsyncSession) -> dict:
    online_svc = await _service(db, "sslcommerz")
    online_enabled = bool(online_svc and online_svc.is_enabled)
    online_configured = await get_live_creds(db, "sslcommerz") is not None
    manual_svc = await _service(db, MANUAL_CODE)
    manual_enabled = bool(manual_svc and manual_svc.is_enabled)
    accounts = await manual_accounts(db)
    methods = [{"method": m, "label": METHOD_LABELS[m], "details": accounts[m].strip()} for m in ACCOUNT_KEYS if (accounts.get(m) or "").strip()]
    return {
        "online": {"enabled": online_enabled, "configured": online_configured, "available": online_enabled and online_configured},
        "manual": {"enabled": manual_enabled, "available": manual_enabled and bool(methods), "methods": methods if manual_enabled else [],
                   "note": (accounts.get("note") or "").strip()},
    }


async def online_available(db: AsyncSession) -> bool:
    return (await get_options(db))["online"]["available"]
