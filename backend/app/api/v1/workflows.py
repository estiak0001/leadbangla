import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.contact import Contact
from app.models.organization import OrganizationMember
from app.schemas.workflow import (
    EnrollmentRead,
    ManualTriggerRequest,
    StepLogRead,
    WorkflowCreate,
    WorkflowRead,
    WorkflowUpdate,
)
from app.services import workflow_service as svc

router = APIRouter(prefix="/workflows", tags=["workflows"])


async def _to_read(wf, db: AsyncSession) -> WorkflowRead:
    counts = await svc.enrollment_counts(db, wf.id)
    return WorkflowRead(
        id=wf.id,
        name=wf.name,
        trigger_type=wf.trigger_type.value,
        trigger_config=wf.trigger_config,
        steps=wf.steps,
        is_active=wf.is_active,
        created_at=wf.created_at,
        updated_at=wf.updated_at,
        **counts,
    )


@router.get("", response_model=list[WorkflowRead])
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    wfs = await svc.list_workflows(db, member.organization_id)
    return [await _to_read(wf, db) for wf in wfs]


@router.post("", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    body: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    wf = await svc.create_workflow(
        db,
        member.organization_id,
        name=body.name,
        trigger_type=body.trigger_type,
        trigger_config=body.trigger_config,
        steps=body.steps,
    )
    return await _to_read(wf, db)


@router.get("/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    try:
        wf = await svc.get_workflow(db, member.organization_id, workflow_id)
    except svc.WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return await _to_read(wf, db)


@router.put("/{workflow_id}", response_model=WorkflowRead)
async def update_workflow(
    workflow_id: uuid.UUID,
    body: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    try:
        wf = await svc.update_workflow(
            db,
            member.organization_id,
            workflow_id,
            name=body.name,
            trigger_type=body.trigger_type,
            trigger_config=body.trigger_config,
            steps=body.steps,
            is_active=body.is_active,
        )
    except svc.WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return await _to_read(wf, db)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    try:
        await svc.delete_workflow(db, member.organization_id, workflow_id)
    except svc.WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")


@router.get("/{workflow_id}/enrollments", response_model=list[EnrollmentRead])
async def list_enrollments(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    try:
        wf = await svc.get_workflow(db, member.organization_id, workflow_id)
    except svc.WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")

    enrollments = await svc.get_enrollments(db, member.organization_id, wf.id)
    result = []
    for e in enrollments:
        contact = await svc.get_contact_for_enrollment(db, e.contact_id)
        logs = await svc.get_step_logs(db, e.id)
        result.append(
            EnrollmentRead(
                id=e.id,
                contact_id=e.contact_id,
                contact_email=contact.email if contact else None,
                contact_name=f"{contact.first_name or ''} {contact.last_name or ''}".strip() if contact else None,
                current_step_index=e.current_step_index,
                status=e.status.value,
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
                error_message=e.error_message,
                step_logs=[
                    StepLogRead(
                        step_index=l.step_index,
                        step_type=l.step_type,
                        status=l.status.value,
                        notes=l.notes,
                        executed_at=l.executed_at,
                    )
                    for l in logs
                ],
            )
        )
    return result


@router.post("/{workflow_id}/trigger", status_code=status.HTTP_202_ACCEPTED)
async def manual_trigger(
    workflow_id: uuid.UUID,
    body: ManualTriggerRequest,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    """Manually enroll a contact into this workflow (for testing or one-off sends)."""
    try:
        wf = await svc.get_workflow(db, member.organization_id, workflow_id)
    except svc.WorkflowNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")

    from sqlalchemy import select
    contact = await db.scalar(
        select(Contact).where(
            Contact.id == body.contact_id,
            Contact.organization_id == member.organization_id,
        )
    )
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    try:
        enrollment = await svc.enroll_contact(db, wf, body.contact_id)
    except svc.ContactAlreadyEnrolledError:
        raise HTTPException(status_code=409, detail="Contact already has an active enrollment in this workflow")

    from app.workers.workflow_runner import execute_workflow_step_task
    execute_workflow_step_task.delay(str(enrollment.id))
    return {"enrollment_id": str(enrollment.id), "status": "queued"}
