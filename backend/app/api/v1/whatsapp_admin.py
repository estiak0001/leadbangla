"""Admin WhatsApp panel helpers: customers' business numbers and a real test message."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds
from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.integrations.sslwireless import sslwireless_client
from app.models.organization import Organization
from app.models.platform_service import PlatformService
from app.models.user import User
from app.services.phone import normalize_bd_msisdn

router = APIRouter(prefix="/admin/whatsapp", tags=["admin"])


@router.get("/numbers")
async def list_numbers(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> list[dict]:
    from app.services.whatsapp_health_service import health_map  # noqa: PLC0415

    rows = await db.scalars(select(Organization).where(Organization.whatsapp_number.isnot(None)).order_by(Organization.name))
    health = await health_map(db)
    out = []
    for o in rows:
        own = decrypt_creds(o.whatsapp_meta_enc) if o.whatsapp_meta_enc else {}
        source = "own" if own else ("dedicated" if o.whatsapp_phone_number_id else "shared")
        out.append({"source": source, "health": health.get(str(o.id)),"org_id": str(o.id), "org_name": o.name, "number": o.whatsapp_number, "approved": o.whatsapp_number_approved,
                    "phone_number_id": o.whatsapp_phone_number_id or own.get("phone_number_id"), "own_account": bool(own),
                    "verified_name": own.get("verified_name"), "quality": own.get("quality"), "has_waba": bool(own.get("waba_id"))})
    return out


class AssignBody(BaseModel):
    org_id: str
    number: str = Field(min_length=6, max_length=32)
    phone_number_id: str | None = Field(default=None, max_length=40)   # Meta phone number id of a dedicated number
    use_shared_number: bool = False          # explicit choice: this customer sends from the shared platform number


@router.post("/numbers")
async def assign_number(body: AssignBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Set up a customer's WhatsApp business number yourself and approve it."""
    try:
        number = "+" + normalize_bd_msisdn(body.number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pid = (body.phone_number_id or "").strip() or None
    if not pid and not body.use_shared_number:
        raise HTTPException(status_code=400, detail=(
            "Choose how this customer sends: enter the Meta phone number ID of their dedicated number, "
            "or tick \"Use the shared platform number\". Without an ID their messages go out from the shared number, not theirs."))
    if pid and body.use_shared_number:
        raise HTTPException(status_code=400, detail="Pick one: a dedicated Meta phone number ID, or the shared platform number.")
    if pid and not pid.isdigit():
        raise HTTPException(status_code=400, detail="The Meta phone number ID is digits only (it is not the phone number).")
    org = await db.get(Organization, uuid.UUID(body.org_id))
    if org is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    org.whatsapp_number, org.whatsapp_number_approved = number, True
    org.whatsapp_phone_number_id = pid
    await db.commit()
    return {"ok": True}


@router.get("/health")
async def whatsapp_health(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Last scheduled check of the platform's Meta connection."""
    from app.services.whatsapp_health_service import health_map  # noqa: PLC0415

    return {"platform": (await health_map(db)).get(None)}


@router.post("/health/run")
async def run_health_now(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Run the same check the scheduler runs every 6 hours, right now."""
    from app.services.whatsapp_health_service import run_all  # noqa: PLC0415

    return await run_all(db)


@router.delete("/numbers/{org_id}", status_code=204)
async def revoke_number(org_id: str, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> None:
    org = await db.get(Organization, uuid.UUID(org_id))
    if org is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    org.whatsapp_number, org.whatsapp_number_approved, org.whatsapp_phone_number_id = None, False, None
    org.whatsapp_meta_enc = None       # a customer's own Meta token is deleted too
    await db.commit()


class SendTestBody(BaseModel):
    to: str
    message: str = "LeadBangla test WhatsApp message. If you can read this, your connection works."


@router.post("/send-test")
async def send_test(body: SendTestBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    meta_svc = await db.scalar(select(PlatformService).where(PlatformService.code == "meta_whatsapp"))
    if meta_svc is not None and meta_svc.credentials_enc:
        from app.integrations import meta_whatsapp as mw  # noqa: PLC0415

        creds = decrypt_creds(meta_svc.credentials_enc)
        if not creds.get("access_token") or not creds.get("phone_number_id"):
            return {"ok": False, "message": "Save the access token and phone number ID first."}
        try:
            # Every new WhatsApp business account has the "hello_world" template, so this works before any template of yours is approved.
            mid = await mw.send_template(creds, to=body.to, name="hello_world", language="en_US")
        except (ValueError, mw.MetaWhatsAppError) as e:
            return {"ok": False, "message": str(e)}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "message": f"Could not reach Meta: {e}"}
        return {"ok": True, "message": f"Sent the “hello_world” template to {body.to} (id {mid[:24]}…). Check WhatsApp on that phone."}
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == "whatsapp_bsp"))
    if svc is None or not svc.credentials_enc:
        return {"ok": False, "message": "Save the WhatsApp credentials first."}
    try:
        mid = await sslwireless_client.send_whatsapp_with_creds(decrypt_creds(svc.credentials_enc), to=body.to, message=body.message)
    except ValueError as e:
        return {"ok": False, "message": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "message": f"Gateway error: {e}"}
    return {"ok": True, "message": f"Accepted for {body.to} (id {mid}). Check WhatsApp on that phone."}


# ── Template approvals ────────────────────────────────────────────────────────

@router.get("/template-requests")
async def admin_template_requests(status: str | None = None, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> list[dict]:
    from app.services import whatsapp_template_service as wts  # noqa: PLC0415

    return [wts.read(r, name) for r, name in await wts.admin_list(db, status)]


class TemplateDecision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    note: str | None = Field(default=None, max_length=2000)


@router.post("/template-requests/{request_id}/decision")
async def admin_template_decide(request_id: uuid.UUID, body: TemplateDecision, user: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    from app.services import whatsapp_template_service as wts  # noqa: PLC0415

    try:
        return wts.read(await wts.decide(db, request_id, body.decision, body.note, user.email))
    except wts.TemplateError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


@router.post("/template-requests/{request_id}/sync")
async def admin_template_sync(request_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Ask Meta for the template's current status."""
    from app.services import whatsapp_template_service as wts  # noqa: PLC0415

    try:
        return wts.read(await wts.sync_one(db, request_id))
    except wts.TemplateError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


@router.post("/numbers/{org_id}/check")
async def check_own_account(org_id: str, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Ask Meta whether a customer's own account still works, and refresh its name and quality rating."""
    from app.core.cred_crypto import encrypt_creds  # noqa: PLC0415
    from app.integrations import meta_whatsapp as mw  # noqa: PLC0415

    org = await db.get(Organization, uuid.UUID(org_id))
    if org is None or not org.whatsapp_meta_enc:
        raise HTTPException(status_code=404, detail="This customer has no own Meta account")
    creds = decrypt_creds(org.whatsapp_meta_enc)
    try:
        info = await mw.phone_info(creds)
    except mw.MetaWhatsAppError as e:
        return {"ok": False, "message": str(e)}
    creds["verified_name"], creds["quality"] = info.get("verified_name"), info.get("quality_rating")
    org.whatsapp_meta_enc = encrypt_creds(creds)
    await db.commit()
    return {"ok": True, "message": f"Working. {info.get('verified_name') or 'Unnamed'} · {info.get('display_phone_number')} · quality {str(info.get('quality_rating') or 'unknown').lower()}.",
            "quality": info.get("quality_rating"), "verified_name": info.get("verified_name")}
