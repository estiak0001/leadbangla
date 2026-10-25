from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership, get_current_user
from app.models.user import User
from app.schemas.push import (
    PushCampaignCreate,
    PushCampaignRead,
    PushConfigRead,
    PushTokenRead,
    PushTokenRegister,
)
from app.services import push_service as svc

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/config", response_model=PushConfigRead)
async def get_config(
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    """Everything the Push page needs. Keys are managed by the platform admin, not per customer."""
    from datetime import datetime, timedelta, timezone  # noqa: PLC0415

    from sqlalchemy import func, select  # noqa: PLC0415

    from app.models.push import PushToken  # noqa: PLC0415

    org_id = membership.organization_id
    cfg = await svc.get_or_create_config(db, org_id)
    keys = await svc.vapid_keys(db, org_id, cfg)
    week = datetime.now(timezone.utc) - timedelta(days=7)
    total = await db.scalar(select(func.count(PushToken.id)).where(PushToken.organization_id == org_id)) or 0
    recent = await db.scalar(select(func.count(PushToken.id)).where(PushToken.organization_id == org_id, PushToken.created_at >= week)) or 0
    linked = await db.scalar(select(func.count(PushToken.id)).where(PushToken.organization_id == org_id, PushToken.contact_id.isnot(None))) or 0
    return PushConfigRead(ready=bool(keys), vapid_public_key=keys["public"] if keys else None, site_key=cfg.site_key,
                          subscribers=total, last_7_days=recent, linked=linked)


@router.post("/tokens", response_model=PushTokenRead, status_code=201)
async def register_token(
    body: PushTokenRegister,
    membership=Depends(get_current_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = await svc.register_token(db, membership.organization_id, body, current_user.email)
    return token


@router.get("/tokens", response_model=list[PushTokenRead])
async def list_tokens(
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_tokens(db, membership.organization_id)


@router.delete("/tokens", status_code=204)
async def unregister_token(
    endpoint: str,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    await svc.delete_token(db, membership.organization_id, endpoint)


@router.get("/campaigns", response_model=list[PushCampaignRead])
async def list_campaigns(
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_campaigns(db, membership.organization_id)


@router.post("/campaigns", response_model=PushCampaignRead, status_code=201)
async def create_campaign(
    body: PushCampaignCreate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_and_send_campaign(db, membership.organization_id, body)
