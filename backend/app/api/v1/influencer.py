from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.schemas.influencer import (
    DeliverableCreate,
    DeliverableRead,
    DeliverableUpdate,
    InfluencerCreate,
    InfluencerRead,
    InfluencerUpdate,
)
from app.services import influencer_service as svc

router = APIRouter(prefix="/influencers", tags=["influencers"])


@router.get("", response_model=list[InfluencerRead])
async def list_influencers(
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_influencers(db, membership.organization_id)


@router.post("", response_model=InfluencerRead, status_code=201)
async def create_influencer(
    body: InfluencerCreate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_influencer(db, membership.organization_id, body)


@router.put("/{influencer_id}", response_model=InfluencerRead)
async def update_influencer(
    influencer_id: UUID,
    body: InfluencerUpdate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    obj = await svc.update_influencer(db, membership.organization_id, influencer_id, body)
    if not obj:
        raise HTTPException(status_code=404, detail="Influencer not found")
    return obj


@router.delete("/{influencer_id}", status_code=204)
async def delete_influencer(
    influencer_id: UUID,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    if not await svc.delete_influencer(db, membership.organization_id, influencer_id):
        raise HTTPException(status_code=404, detail="Influencer not found")


@router.get("/{influencer_id}/deliverables", response_model=list[DeliverableRead])
async def list_deliverables(
    influencer_id: UUID,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_deliverables(db, membership.organization_id, influencer_id)


@router.post("/{influencer_id}/deliverables", response_model=DeliverableRead, status_code=201)
async def create_deliverable(
    influencer_id: UUID,
    body: DeliverableCreate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    obj = await svc.create_deliverable(db, membership.organization_id, influencer_id, body)
    if not obj:
        raise HTTPException(status_code=404, detail="Influencer not found")
    return obj


@router.put("/deliverables/{deliverable_id}", response_model=DeliverableRead)
async def update_deliverable(
    deliverable_id: UUID,
    body: DeliverableUpdate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    obj = await svc.update_deliverable(db, membership.organization_id, deliverable_id, body)
    if not obj:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    return obj


@router.delete("/deliverables/{deliverable_id}", status_code=204)
async def delete_deliverable(
    deliverable_id: UUID,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    if not await svc.delete_deliverable(db, membership.organization_id, deliverable_id):
        raise HTTPException(status_code=404, detail="Deliverable not found")
