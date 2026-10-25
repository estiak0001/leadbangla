"""Admin SMS Gateway panel: configure the platform's SMS provider (Alpha SMS or
SSL Wireless), test it, and switch it live. Customers never see any of this."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.integrations import sms_gateway
from app.integrations.sms_gateway import SMS_PROVIDERS, SmsGatewayError
from app.models.enums import SmsEventType
from app.models.organization import Organization
from app.models.platform_service import PlatformService
from app.models.sms import SmsEvent
from app.models.user import User
from app.models.verification import VerificationRequest
from app.services.plan_service import get_credit_rate

router = APIRouter(prefix="/admin/sms-gateway", tags=["admin"])

PROVIDER_FIELDS: dict[str, list[dict]] = {
    "alphasms": [
        {"key": "api_key", "label": "API key", "secret": True, "required": True,
         "hint": "Alpha SMS panel → API page. Keep it secret."},
        {"key": "default_sender_id", "label": "Default Sender ID", "secret": False, "required": False,
         "hint": "Optional. An approved Sender ID on your Alpha SMS account, used for customers without their own masking ID. Leave empty to use Alpha's default sender."},
    ],
    "sslwireless": [
        {"key": "api_token", "label": "API token", "secret": True, "required": True, "hint": "From the SSL Wireless panel."},
        {"key": "default_sender_id", "label": "Default Sender ID", "secret": False, "required": False,
         "hint": f"Used for customers without their own masking ID. Empty = {settings.sslwireless_sender_id}."},
    ],
}
META = {
    "alphasms": {"name": "Alpha SMS", "docs": "https://sms.bd/api", "tagline": "Bangladeshi bulk SMS · sms.net.bd · Bangla & English"},
    "sslwireless": {"name": "SSL Wireless", "docs": "https://sms.sslwireless.com/pushapi/", "tagline": "BTRC-recognised aggregator · SMS + WhatsApp BSP"},
}


def _mask(v: str) -> str:
    return v if len(v) <= 6 else f"{v[:3]}{'•' * 6}{v[-3:]}"


async def _svc(db: AsyncSession, code: str) -> PlatformService:
    if code not in SMS_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown SMS provider")
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc is None:
        raise HTTPException(status_code=404, detail="Provider is not installed — run database migrations")
    return svc


def _creds(svc: PlatformService) -> dict:
    return decrypt_creds(svc.credentials_enc) if svc.credentials_enc else {}


def _provider_read(svc: PlatformService) -> dict:
    creds = _creds(svc)
    fields = PROVIDER_FIELDS[svc.code]
    return {
        "code": svc.code, **{k: META[svc.code][k] for k in ("name", "docs", "tagline")},
        "fields": [{**f, "value": (_mask(creds.get(f["key"], "")) if f["secret"] else creds.get(f["key"], "")), "is_set": bool(creds.get(f["key"]))} for f in fields],
        "has_credentials": all(creds.get(f["key"]) for f in fields if f["required"]),
        "is_live": svc.is_live, "is_enabled": svc.is_enabled,
        "last_tested_at": svc.last_tested_at, "last_test_ok": svc.last_test_ok, "last_test_error": svc.last_test_error,
    }


@router.get("")
async def overview(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    svcs = {s.code: s for s in await db.scalars(select(PlatformService).where(PlatformService.code.in_(SMS_PROVIDERS)))}
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    sent = await db.scalar(select(func.count(SmsEvent.id)).where(SmsEvent.type == SmsEventType.SENT, SmsEvent.occurred_at >= month_start)) or 0
    failed = await db.scalar(select(func.count(SmsEvent.id)).where(SmsEvent.type == SmsEventType.FAILED, SmsEvent.occurred_at >= month_start)) or 0
    pending = await db.scalar(select(func.count(VerificationRequest.id)).where(VerificationRequest.status.in_(("pending", "submitted")), VerificationRequest.kind == "sms_sender_id")) or 0
    masked = await db.scalar(select(func.count(Organization.id)).where(Organization.sms_sender_id_approved.is_(True))) or 0
    rate = await get_credit_rate(db, "sms")
    active = await sms_gateway.active_provider(db)
    return {
        "providers": [_provider_read(svcs[c]) for c in SMS_PROVIDERS if c in svcs],
        "active": active[0] if active else None,
        "stats": {"sent_this_month": sent, "failed_this_month": failed, "pending_masking_requests": pending, "masking_approved": masked},
        "customer_rate_bdt": float(rate.rate_bdt) if rate else None,
    }


class CredentialsBody(BaseModel):
    # Secret fields left blank keep their stored value.
    values: dict[str, str] = Field(default_factory=dict)


@router.put("/{code}/credentials")
async def save_credentials(code: str, body: CredentialsBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    svc = await _svc(db, code)
    current = _creds(svc)
    merged = dict(current)
    for f in PROVIDER_FIELDS[code]:
        v = (body.values.get(f["key"]) or "").strip()
        if v:
            merged[f["key"]] = v
        elif not f["secret"] and f["key"] in body.values:
            merged.pop(f["key"], None)  # an emptied plain field is cleared
    missing = [f["label"] for f in PROVIDER_FIELDS[code] if f["required"] and not merged.get(f["key"])]
    if missing:
        raise HTTPException(status_code=400, detail=f"Enter: {', '.join(missing)}")
    svc.credentials_enc = encrypt_creds(merged)
    svc.last_test_ok, svc.last_test_error, svc.last_tested_at = None, None, None  # must re-test new credentials
    await db.commit()
    return _provider_read(svc)


async def _record(db: AsyncSession, svc: PlatformService, ok: bool, message: str) -> None:
    svc.last_tested_at, svc.last_test_ok, svc.last_test_error = datetime.now(timezone.utc), ok, (None if ok else message)
    await db.commit()


@router.post("/{code}/test")
async def test_connection(code: str, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Checks the credentials against the gateway. For Alpha SMS this reads the account balance."""
    svc = await _svc(db, code)
    creds = _creds(svc)
    if not creds:
        return {"ok": False, "message": "Save your credentials first.", "balance": None}
    try:
        if code == "alphasms":
            balance = await sms_gateway.alpha_balance(creds)
            msg = f"Connected to Alpha SMS. Account balance: {balance:,.2f}."
            await _record(db, svc, True, msg)
            return {"ok": True, "message": msg, "balance": balance}
        from app.services.integration_test_service import test_service  # noqa: PLC0415

        ok, msg = await test_service("sslwireless", creds)
        await _record(db, svc, ok, msg)
        return {"ok": ok, "message": msg, "balance": None}
    except SmsGatewayError as e:
        await _record(db, svc, False, str(e))
        return {"ok": False, "message": str(e), "balance": None}
    except Exception as e:  # noqa: BLE001
        await _record(db, svc, False, f"Could not reach the gateway: {e}")
        return {"ok": False, "message": f"Could not reach the gateway: {e}", "balance": None}


class SendTestBody(BaseModel):
    to: str
    message: str = "LeadBangla test SMS. If you can read this, your SMS gateway works."


@router.post("/{code}/send-test")
async def send_test(code: str, body: SendTestBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Sends one real SMS with the saved credentials, from the default sender — works before going live."""
    svc = await _svc(db, code)
    creds = _creds(svc)
    if not creds:
        return {"ok": False, "message": "Save your credentials first."}
    sid = creds.get("default_sender_id") or (settings.sslwireless_sender_id if code == "sslwireless" else None)
    try:
        mid = await sms_gateway.send_with(code, creds, to=body.to, message=body.message, sender_id=sid)
    except (SmsGatewayError, ValueError) as e:
        return {"ok": False, "message": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "message": f"Could not reach the gateway: {e}"}
    return {"ok": True, "message": f"Accepted by {META[code]['name']} for {body.to}" + (f" (sender “{sid}”)" if sid else "") + f", request id {mid}. Check the phone."}


class ActivateBody(BaseModel):
    live: bool


@router.post("/{code}/activate")
async def activate(code: str, body: ActivateBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Makes this provider the one all customers send through (and turns the other off)."""
    svc = await _svc(db, code)
    if body.live:
        if not _provider_read(svc)["has_credentials"]:
            raise HTTPException(status_code=400, detail="Save credentials before going live.")
        for other in await db.scalars(select(PlatformService).where(PlatformService.code.in_(SMS_PROVIDERS))):
            other.is_live = other.code == code
        svc.is_enabled = True
    else:
        svc.is_live = False
    await db.commit()
    return await overview(_, db)


@router.delete("/{code}/credentials", status_code=204)
async def clear_credentials(code: str, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> None:
    svc = await _svc(db, code)
    svc.credentials_enc, svc.is_live = None, False
    svc.last_test_ok, svc.last_test_error, svc.last_tested_at = None, None, None
    await db.commit()


@router.get("/usage")
async def usage(days: int = 30, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """SMS volume and customer spend per day and per company, plus the live gateway balance when available."""
    from app.services.usage_report import sms_platform_usage  # noqa: PLC0415

    data = await sms_platform_usage(db, days)
    balance, balance_error = None, None
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == "alphasms"))
    if svc and svc.credentials_enc:
        try:
            balance = await sms_gateway.alpha_balance(_creds(svc))
        except Exception as e:  # noqa: BLE001
            balance_error = str(e)
    return {**data, "gateway_balance": balance, "gateway_balance_error": balance_error}


# ── Masking Sender IDs (one place for them all) ──────────────────────────────

@router.get("/sender-ids")
async def list_sender_ids(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Every organisation that has a masking Sender ID (requested, approved or assigned by staff)."""
    rows = await db.scalars(select(Organization).where(Organization.sms_sender_id.isnot(None)).order_by(Organization.name))
    return [{"org_id": str(o.id), "org_name": o.name, "sender_id": o.sms_sender_id, "approved": o.sms_sender_id_approved} for o in rows]


class AssignBody(BaseModel):
    org_id: str
    sender_id: str = Field(min_length=1, max_length=20)


@router.post("/sender-ids")
async def assign_sender_id(body: AssignBody, user: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Assign a Sender ID to a customer directly and approve it (e.g. one you registered for them)."""
    import uuid  # noqa: PLC0415

    from app.services.sms_service import admin_set_org_sms_sender  # noqa: PLC0415
    from app.services.verification_service import mark_from_admin  # noqa: PLC0415

    try:
        org_id = uuid.UUID(body.org_id)
        await admin_set_org_sms_sender(db, org_id, sender_id=body.sender_id.strip(), approved=True)
    except ValueError:
        raise HTTPException(status_code=404, detail="Customer not found")
    await mark_from_admin(db, org_id, True, user.email)
    return {"ok": True}


@router.delete("/sender-ids/{org_id}", status_code=204)
async def revoke_sender_id(org_id: str, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> None:
    """Remove a customer's masking Sender ID; they go back to the shared sender."""
    import uuid  # noqa: PLC0415

    from app.services.sms_service import admin_set_org_sms_sender  # noqa: PLC0415

    try:
        await admin_set_org_sms_sender(db, uuid.UUID(org_id), sender_id=None, approved=False)
    except ValueError:
        raise HTTPException(status_code=404, detail="Customer not found")
