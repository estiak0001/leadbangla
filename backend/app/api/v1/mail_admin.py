from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.integrations import mail_aws
from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.models.platform_service import PlatformService
from app.models.user import User
from app.services.email_provider_service import get_ses_config

router = APIRouter(prefix="/admin/mail", tags=["admin"])


@router.post("/check-setup")
async def check_setup(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Read-only check of the AWS side of the shared inbox (bucket, receipt rules, notifications)."""
    cfg = await get_ses_config(db)
    if cfg is None:
        raise HTTPException(status_code=400, detail="Connect and switch on Amazon SES first.")
    checks = await mail_aws.check_setup(cfg)
    return {"ok": all(c["ok"] for c in checks), "region": cfg["region"], "mx": mail_aws.mx_value(cfg["region"]), "checks": checks}


async def _cfg(db: AsyncSession) -> dict:
    cfg = await get_ses_config(db)
    if cfg is None:
        raise HTTPException(status_code=400, detail="Connect and switch on Amazon SES first.")
    return cfg


@router.post("/events/check")
async def check_events(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Read-only: are bounces and complaints really flowing from SES to LeadBangla?"""
    cfg = await _cfg(db)
    checks = await mail_aws.events_status(cfg)
    return {"ok": all(c["ok"] for c in checks), "checks": checks, "set": mail_aws.EVENTS_SET}


@router.post("/events/setup")
async def setup_events(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Creates the SES configuration set 'leadbangla-events' with a bounce+complaint destination on your SNS topic,
    and saves it as the Configuration Set used for sending. Safe to press again."""
    cfg = await _cfg(db)
    try:
        await mail_aws.setup_events(cfg)
    except mail_aws.MailSetupError as e:
        raise HTTPException(status_code=400, detail=str(e))
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == "amazon_ses"))
    if svc and svc.credentials_enc:
        creds = decrypt_creds(svc.credentials_enc)
        creds["configuration_set"] = mail_aws.EVENTS_SET
        svc.credentials_enc = encrypt_creds(creds)
        await db.commit()
    cfg["configuration_set"] = mail_aws.EVENTS_SET
    checks = await mail_aws.events_status(cfg)
    return {"ok": all(c["ok"] for c in checks), "checks": checks, "set": mail_aws.EVENTS_SET}
