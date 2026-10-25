import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.campaign import Campaign
from app.models.organization import OrganizationMember
from app.schemas.campaign import (
    CampaignCreate,
    CampaignHistoryRead,
    CampaignUpdate,
    CampaignEventsResult,
    CampaignPrecheck,
    CampaignRead,
    EmailConnectionStatus,
)
from app.services.campaign_service import (
    CampaignAlreadySentError,
    CampaignHistoryNotFoundError,
    CampaignNotEditableError,
    CampaignNotFoundError,
    CampaignNotSendingError,
    SegmentRequiredError,
    campaign_precheck,
    create_campaign,
    event_counts_for_campaign,
    get_campaign,
    get_email_connection_status,
    list_campaign_events,
    list_campaign_history,
    list_campaigns,
    list_trashed_campaigns,
    restore_campaign,
    revert_campaign_history,
    soft_delete_campaign,
    update_campaign,
    mark_campaign_sending,
    request_cancel,
    simulate_engagement,
)
from app.workers.tasks import send_campaign_task

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


async def _to_read(db: AsyncSession, campaign: Campaign) -> CampaignRead:
    counts = await event_counts_for_campaign(db, campaign.id)
    return CampaignRead(
        id=campaign.id,
        name=campaign.name,
        status=campaign.status.value,
        subject=campaign.subject,
        html_body=campaign.html_body,
        segment_id=campaign.segment_id,
        sender_id=campaign.sender_id,
        reply_to=campaign.reply_to,
        sent_at=campaign.sent_at,
        deleted_at=campaign.deleted_at,
        created_at=campaign.created_at,
        sent_count=counts["sent"],
        opened_count=counts["opened"],
        clicked_count=counts["clicked"],
        failed_count=counts["failed"],
        total_recipients=campaign.total_recipients,
    )


@router.get("", response_model=list[CampaignRead])
async def get_campaigns(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[CampaignRead]:
    campaigns = await list_campaigns(db, membership.organization_id)
    return [await _to_read(db, c) for c in campaigns]


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_campaign_route(
    payload: CampaignCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        campaign = await create_campaign(
            db,
            membership.organization_id,
            name=payload.name,
            segment_id=payload.segment_id,
            subject=payload.subject,
            html_body=payload.html_body,
            sender_id=payload.sender_id,
            reply_to=payload.reply_to,
            changed_by_user_id=membership.user_id,
        )
    except SegmentRequiredError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    return await _to_read(db, campaign)


@router.get("/trash", response_model=list[CampaignRead])
async def get_trashed_campaigns(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[CampaignRead]:
    return [await _to_read(db, c) for c in await list_trashed_campaigns(db, membership.organization_id)]


@router.post("/trash/{campaign_id}/restore", response_model=CampaignRead)
async def restore_campaign_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        campaign = await restore_campaign(db, membership.organization_id, campaign_id, membership.user_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found in trash")
    return await _to_read(db, campaign)


@router.get("/connection-status", response_model=EmailConnectionStatus)
async def email_connection_status_route(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> EmailConnectionStatus:
    result = await get_email_connection_status(db, membership.organization_id)
    return EmailConnectionStatus(**result)


@router.get("/{campaign_id}", response_model=CampaignRead)
async def get_campaign_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        campaign = await get_campaign(db, membership.organization_id, campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return await _to_read(db, campaign)


@router.get("/{campaign_id}/precheck", response_model=CampaignPrecheck)
async def campaign_precheck_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignPrecheck:
    try:
        result = await campaign_precheck(db, membership.organization_id, campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return CampaignPrecheck(**result)


@router.get("/{campaign_id}/events", response_model=CampaignEventsResult)
async def campaign_events_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignEventsResult:
    try:
        result = await list_campaign_events(db, membership.organization_id, campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return CampaignEventsResult(**result)


@router.post("/{campaign_id}/cancel", response_model=CampaignRead)
async def cancel_campaign_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        campaign = await request_cancel(db, membership.organization_id, campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    except CampaignNotSendingError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Campaign is not currently sending")
    return await _to_read(db, campaign)


@router.post("/{campaign_id}/send", response_model=CampaignRead)
async def send_campaign_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    """Flips the campaign to SENDING and hands off to Celery — the actual
    sending never runs inline in this request."""
    status_now = await get_email_connection_status(db, membership.organization_id)
    if not status_now["connection_ok"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=status_now["connection_note"])
    try:
        campaign = await mark_campaign_sending(db, membership.organization_id, campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    except CampaignAlreadySentError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Campaign already sent")

    send_campaign_task.delay(str(membership.organization_id), str(campaign_id))
    return await _to_read(db, campaign)


@router.post("/{campaign_id}/simulate-engagement", response_model=CampaignRead)
async def simulate_engagement_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        await simulate_engagement(db, membership.organization_id, campaign_id)
        campaign = await get_campaign(db, membership.organization_id, campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return await _to_read(db, campaign)


@router.put("/{campaign_id}", response_model=CampaignRead)
async def update_campaign_route(
    campaign_id: uuid.UUID,
    payload: CampaignUpdate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        campaign = await update_campaign(
            db, membership.organization_id, campaign_id, membership.user_id,
            **payload.model_dump(exclude_unset=True),
        )
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    except SegmentRequiredError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    except CampaignNotEditableError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft campaigns can be edited")
    return await _to_read(db, campaign)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete — moves the campaign to the trash; it can be restored."""
    try:
        await soft_delete_campaign(db, membership.organization_id, campaign_id, membership.user_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    except CampaignNotEditableError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stop the campaign before deleting it")


@router.get("/{campaign_id}/history", response_model=list[CampaignHistoryRead])
async def campaign_history_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[CampaignHistoryRead]:
    try:
        return await list_campaign_history(db, membership.organization_id, campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")


@router.post("/{campaign_id}/history/{history_id}/restore", response_model=CampaignRead)
async def restore_campaign_history_route(
    campaign_id: uuid.UUID,
    history_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> CampaignRead:
    try:
        campaign = await revert_campaign_history(
            db, membership.organization_id, campaign_id, history_id, membership.user_id
        )
    except CampaignNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    except CampaignNotEditableError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft campaigns can be reverted")
    except CampaignHistoryNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="History entry not found or has nothing to restore")
    return await _to_read(db, campaign)
