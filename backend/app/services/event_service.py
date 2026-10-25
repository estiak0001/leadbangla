import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.event_marketing import EventRegistration, MarketingEvent
from app.models.workflow import Workflow
from app.schemas.event_marketing import EventCreate, EventRead, RegistrationRead
from app.services.workflow_service import ContactAlreadyEnrolledError, enroll_contact
from app.workers.workflow_runner import execute_workflow_step_task


async def list_events(db: AsyncSession, org_id: uuid.UUID) -> list[EventRead]:
    count_sq = (
        select(EventRegistration.event_id, func.count().label("cnt"))
        .group_by(EventRegistration.event_id)
        .subquery()
    )
    rows = await db.execute(
        select(MarketingEvent, func.coalesce(count_sq.c.cnt, 0).label("registration_count"))
        .outerjoin(count_sq, MarketingEvent.id == count_sq.c.event_id)
        .where(MarketingEvent.organization_id == org_id)
        .order_by(MarketingEvent.event_date)
    )
    result = []
    for event, reg_count in rows:
        r = EventRead.model_validate(event)
        r.registration_count = reg_count
        result.append(r)
    return result


async def create_event(
    db: AsyncSession, org_id: uuid.UUID, payload: EventCreate
) -> EventRead:
    event = MarketingEvent(
        organization_id=org_id,
        title=payload.title,
        description=payload.description,
        event_date=payload.event_date,
        location=payload.location,
        capacity=payload.capacity,
        workflow_id=payload.workflow_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    r = EventRead.model_validate(event)
    r.registration_count = 0
    return r


async def get_event(
    db: AsyncSession, org_id: uuid.UUID, event_id: uuid.UUID
) -> MarketingEvent | None:
    return await db.scalar(
        select(MarketingEvent).where(
            MarketingEvent.id == event_id,
            MarketingEvent.organization_id == org_id,
        )
    )


async def delete_event(
    db: AsyncSession, org_id: uuid.UUID, event_id: uuid.UUID
) -> bool:
    event = await get_event(db, org_id, event_id)
    if not event:
        return False
    await db.delete(event)
    await db.commit()
    return True


async def list_registrations(
    db: AsyncSession, org_id: uuid.UUID, event_id: uuid.UUID
) -> list[RegistrationRead]:
    event = await get_event(db, org_id, event_id)
    if not event:
        return []
    rows = await db.execute(
        select(EventRegistration, Contact.first_name, Contact.last_name, Contact.email)
        .outerjoin(Contact, EventRegistration.contact_id == Contact.id)
        .where(EventRegistration.event_id == event_id)
        .order_by(EventRegistration.registered_at)
    )
    result = []
    for reg, first, last, email in rows:
        r = RegistrationRead.model_validate(reg)
        r.contact_name = f"{first or ''} {last or ''}".strip() or None
        r.contact_email = email
        result.append(r)
    return result


async def register_contact(
    db: AsyncSession,
    org_id: uuid.UUID,
    event_id: uuid.UUID,
    contact_id: uuid.UUID,
) -> RegistrationRead | None:
    event = await get_event(db, org_id, event_id)
    if not event:
        return None

    existing = await db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.contact_id == contact_id,
        )
    )
    if existing:
        return None

    reg = EventRegistration(event_id=event_id, contact_id=contact_id)
    db.add(reg)
    await db.flush()  # get id without committing

    if event.workflow_id:
        workflow = await db.scalar(select(Workflow).where(Workflow.id == event.workflow_id))
        if workflow and workflow.is_active:
            try:
                enrollment = await enroll_contact(db, workflow, contact_id)
                execute_workflow_step_task.delay(str(enrollment.id))
            except ContactAlreadyEnrolledError:
                pass

    await db.commit()
    await db.refresh(reg)

    contact = await db.scalar(select(Contact).where(Contact.id == contact_id))
    r = RegistrationRead.model_validate(reg)
    if contact:
        r.contact_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip() or None
        r.contact_email = contact.email
    return r


async def mark_attended(
    db: AsyncSession,
    org_id: uuid.UUID,
    event_id: uuid.UUID,
    registration_id: uuid.UUID,
) -> RegistrationRead | None:
    event = await get_event(db, org_id, event_id)
    if not event:
        return None
    reg = await db.scalar(
        select(EventRegistration).where(
            EventRegistration.id == registration_id,
            EventRegistration.event_id == event_id,
        )
    )
    if not reg:
        return None
    reg.attended = True
    reg.attended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reg)

    contact = await db.scalar(select(Contact).where(Contact.id == reg.contact_id))
    r = RegistrationRead.model_validate(reg)
    if contact:
        r.contact_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip() or None
        r.contact_email = contact.email
    return r
