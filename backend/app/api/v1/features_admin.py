"""Service switches: staff turn customer-facing services on or off; the app reads the public map."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.models.platform_feature import PlatformFeature
from app.models.user import User
from app.services.feature_flags import feature_map

router = APIRouter(prefix="/admin/features", tags=["admin"])
public_router = APIRouter(prefix="/public", tags=["public"])


class FeatureRead(BaseModel):
    code: str
    name: str
    description: str | None
    is_enabled: bool
    updated_by: str | None
    updated_at: datetime | None


class FeatureUpdate(BaseModel):
    is_enabled: bool


@public_router.get("/features")
async def public_features(db: AsyncSession = Depends(get_db)) -> dict[str, bool]:
    """Which services are switched on (no login needed: the marketing site uses it too)."""
    return await feature_map(db)


@router.get("", response_model=list[FeatureRead])
async def list_features(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> list[PlatformFeature]:
    return list(await db.scalars(select(PlatformFeature).order_by(PlatformFeature.name)))


@router.put("/{code}", response_model=FeatureRead)
async def set_feature(code: str, body: FeatureUpdate, staff: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> PlatformFeature:
    f = await db.get(PlatformFeature, code)
    if f is None:
        raise HTTPException(status_code=404, detail="Unknown service")
    f.is_enabled, f.updated_by = body.is_enabled, staff.email
    await db.commit()
    await db.refresh(f)
    return f
