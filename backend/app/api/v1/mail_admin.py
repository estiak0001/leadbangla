from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.integrations import mail_aws
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
