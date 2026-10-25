from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.organization import OrganizationMember
from app.schemas.analytics import CrossChannelAnalytics, OrgAnalytics
from app.services.analytics_service import get_cross_channel_analytics, get_org_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("", response_model=OrgAnalytics)
async def get_analytics(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> OrgAnalytics:
    return await get_org_analytics(db, membership.organization_id)


@router.get("/cross-channel", response_model=CrossChannelAnalytics)
async def get_cross_channel(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CrossChannelAnalytics:
    return await get_cross_channel_analytics(db, membership.organization_id, from_date, to_date)
