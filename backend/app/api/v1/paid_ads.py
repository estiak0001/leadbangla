import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.organization import OrganizationMember
from app.schemas.paid_ads import (
    AccountCreate,
    AccountRead,
    CampaignCreate,
    CampaignRead,
    SpendRecordRead,
    SyncResult,
)
from app.services import paid_ads_service

router = APIRouter(prefix="/paid-ads", tags=["paid-ads"])


@router.get("/accounts", response_model=list[AccountRead])
async def list_accounts(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[AccountRead]:
    return await paid_ads_service.list_accounts(db, membership.organization_id)


@router.post("/accounts", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
async def connect_account(
    payload: AccountCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> AccountRead:
    try:
        return await paid_ads_service.connect_account(db, membership.organization_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    deleted = await paid_ads_service.delete_account(db, membership.organization_id, account_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")


@router.get("/campaigns", response_model=list[CampaignRead])
async def list_campaigns(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[CampaignRead]:
    return await paid_ads_service.list_campaigns(db, membership.organization_id)


@router.post("/campaigns", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        return await paid_ads_service.create_campaign(db, membership.organization_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ad platform error: {exc}",
        )


@router.post("/campaigns/{campaign_id}/sync", response_model=SyncResult)
async def sync_campaign(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SyncResult:
    return await paid_ads_service.sync_campaign(db, membership.organization_id, campaign_id)


@router.get("/campaigns/{campaign_id}/spend", response_model=list[SpendRecordRead])
async def list_spend(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SpendRecordRead]:
    return await paid_ads_service.list_spend(db, membership.organization_id, campaign_id)
