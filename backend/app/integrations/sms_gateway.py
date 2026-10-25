"""SMS gateway abstraction. The platform admin picks ONE active provider
(Alpha SMS by default, SSL Wireless as an alternative); the rest of the app only
calls send_sms()/balance() here and never knows which provider is behind it.

Alpha SMS API (https://sms.bd/api): GET/POST https://api.sms.net.bd/sendsms with
api_key, msg, to, optional sender_id. Success = {"error": 0, "data": {"request_id": N}}.
Balance = https://api.sms.net.bd/user/balance/?api_key=… -> {"data": {"balance": "…"}}.
"""
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds
from app.core.service_creds import get_live_creds
from app.models.platform_service import PlatformService
from app.services.phone import normalize_bd_msisdn

ALPHA_SEND_URL = "https://api.sms.net.bd/sendsms"
ALPHA_BALANCE_URL = "https://api.sms.net.bd/user/balance/"

SMS_PROVIDERS = ("alphasms", "sslwireless")

# Alpha SMS error codes -> something a person can act on.
ALPHA_ERRORS = {
    400: "The gateway rejected the request (missing or invalid parameter).",
    403: "The API key has no permission for this action.",
    405: "The API key is missing or wrong — check it in Alpha SMS → API.",
    409: "Alpha SMS had an internal error. Try again shortly.",
    410: "The Alpha SMS account has expired — renew it.",
    411: "The Alpha SMS reseller account is expired or suspended.",
    412: "Invalid schedule time.",
    413: "The Sender ID isn't approved on the Alpha SMS account.",
    414: "The message is empty.",
    415: "The message is too long.",
    416: "No valid phone number found.",
    417: "The Alpha SMS account balance is too low — top it up.",
    420: "Alpha SMS blocked this content.",
}


class SmsGatewayError(Exception):
    """A send failed; the message is safe to show to staff or customers."""

    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code


async def active_provider(db: AsyncSession) -> tuple[str, dict] | None:
    """(provider code, credentials) of the live SMS provider, or None → fake mode."""
    for code in SMS_PROVIDERS:
        creds = await get_live_creds(db, code) if code != "sslwireless" else None
        if creds:
            return code, creds
    # SSL Wireless last (its helper also falls back to env vars)
    creds = await get_live_creds(db, "sslwireless")
    return ("sslwireless", creds) if creds else None


async def live_providers(db: AsyncSession) -> list[tuple[str, dict]]:
    """Every switched-on provider, preferred first (Alpha SMS, then SSL Wireless)."""
    out: list[tuple[str, dict]] = []
    for code in SMS_PROVIDERS:
        creds = await get_live_creds(db, code)
        if creds:
            out.append((code, creds))
    return out


async def stored_creds(db: AsyncSession, code: str) -> dict:
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    return decrypt_creds(svc.credentials_enc) if svc and svc.credentials_enc else {}


async def alpha_request(url: str, params: dict) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, data=params) if url == ALPHA_SEND_URL else await client.get(url, params=params)
    try:
        data = r.json()
    except ValueError as e:
        raise SmsGatewayError(f"Unexpected reply from Alpha SMS (HTTP {r.status_code}).") from e
    code = int(data.get("error", -1)) if str(data.get("error", "")).lstrip("-").isdigit() else -1
    if code != 0:
        raise SmsGatewayError(ALPHA_ERRORS.get(code) or data.get("msg") or f"Alpha SMS error {code}", code)
    return data


async def alpha_send(creds: dict, *, to: str, message: str, sender_id: str | None) -> str:
    params = {"api_key": creds["api_key"], "msg": message, "to": normalize_bd_msisdn(to)}
    if sender_id:
        params["sender_id"] = sender_id
    data = await alpha_request(ALPHA_SEND_URL, params)
    return str((data.get("data") or {}).get("request_id") or uuid.uuid4().hex)


async def alpha_balance(creds: dict) -> float:
    data = await alpha_request(ALPHA_BALANCE_URL, {"api_key": creds["api_key"]})
    return float((data.get("data") or {}).get("balance") or 0)


async def send_with(provider: str, creds: dict, *, to: str, message: str, sender_id: str | None) -> str:
    """Send through explicit credentials (used by the admin test box before going live)."""
    if provider == "alphasms":
        return await alpha_send(creds, to=to, message=message, sender_id=sender_id)
    from app.integrations.sslwireless import sslwireless_client

    return await sslwireless_client.send_sms_with_creds(creds, to=to, message=message, sender_id=sender_id or "")


async def send_sms(db: AsyncSession, *, to: str, message: str, sender_id: str | None) -> str:
    """Send through the active provider. `sender_id` is the org's approved masking
    ID or None for the platform default. No provider live → fake id (dev/demo)."""
    candidates = await live_providers(db)
    if not candidates:
        active = await active_provider(db)   # SSL Wireless may still be configured through env vars
        if active is None:
            normalize_bd_msisdn(to)  # still validate the number in fake mode
            return f"fake-sms-{uuid.uuid4().hex}"
        candidates = [active]

    last: Exception | None = None
    for i, (provider, creds) in enumerate(candidates):
        # A masking ID is registered with one provider only; a backup provider uses its own default sender.
        sid = (sender_id if i == 0 else None) or creds.get("default_sender_id") or None
        if provider == "sslwireless" and not sid:
            from app.core.config import settings  # noqa: PLC0415

            sid = settings.sslwireless_sender_id
        try:
            return await send_with(provider, creds, to=to, message=message, sender_id=sid)
        except ValueError:
            raise                      # a bad phone number would fail everywhere
        except SmsGatewayError as e:
            last = e
            if e.code in (414, 415, 416, 420):   # message/number problems: another provider won't help
                raise
        except Exception as e:  # network / unexpected
            last = SmsGatewayError(f"Could not reach the SMS gateway: {e}")
    assert last is not None
    raise last
