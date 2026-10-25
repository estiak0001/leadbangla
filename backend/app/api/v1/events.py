import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.organization import OrganizationMember
from app.schemas.event_marketing import EventCreate, EventRead, RegistrationCreate, RegistrationRead
from app.services import event_service

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventRead])
async def list_events(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[EventRead]:
    return await event_service.list_events(db, membership.organization_id)


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> EventRead:
    return await event_service.create_event(db, membership.organization_id, payload)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    deleted = await event_service.delete_event(db, membership.organization_id, event_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")


@router.get("/{event_id}/registrations", response_model=list[RegistrationRead])
async def list_registrations(
    event_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[RegistrationRead]:
    event = await event_service.get_event(db, membership.organization_id, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return await event_service.list_registrations(db, membership.organization_id, event_id)


@router.post(
    "/{event_id}/registrations",
    response_model=RegistrationRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_contact(
    event_id: uuid.UUID,
    payload: RegistrationCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> RegistrationRead:
    reg = await event_service.register_contact(
        db, membership.organization_id, event_id, payload.contact_id
    )
    if reg is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact already registered or event not found",
        )
    return reg


@router.patch(
    "/{event_id}/registrations/{registration_id}/attend",
    response_model=RegistrationRead,
)
async def mark_attended(
    event_id: uuid.UUID,
    registration_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> RegistrationRead:
    reg = await event_service.mark_attended(
        db, membership.organization_id, event_id, registration_id
    )
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    return reg
