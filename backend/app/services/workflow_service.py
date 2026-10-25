import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PlanLimitError
from app.models.contact import Contact
from app.models.enums import WorkflowEnrollmentStatus, WorkflowTriggerType
from app.models.workflow import Workflow, WorkflowEnrollment, WorkflowStepLog
from app.services.plan_service import get_plan_limit


class WorkflowNotFoundError(Exception):
    pass


class ContactAlreadyEnrolledError(Exception):
    pass


# ── CRUD ──────────────────────────────────────────────────────────────────────


async def create_workflow(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    name: str,
    trigger_type: str,
    trigger_config: dict,
    steps: list,
) -> Workflow:
    limit = await get_plan_limit(db, org_id, "workflows_limit")
    if limit != -1:
        count = await db.scalar(select(func.count(Workflow.id)).where(Workflow.organization_id == org_id))
        if (count or 0) >= limit:
            raise PlanLimitError("workflows", count or 0, limit)

    wf = Workflow(
        organization_id=org_id,
        name=name,
        trigger_type=WorkflowTriggerType(trigger_type),
        trigger_config=trigger_config,
        steps=steps,
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return wf


async def get_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID) -> Workflow:
    wf = await db.scalar(
        select(Workflow).where(Workflow.organization_id == org_id, Workflow.id == workflow_id)
    )
    if wf is None:
        raise WorkflowNotFoundError(workflow_id)
    return wf


async def list_workflows(db: AsyncSession, org_id: uuid.UUID) -> list[Workflow]:
    result = await db.scalars(
        select(Workflow).where(Workflow.organization_id == org_id).order_by(Workflow.created_at.desc())
    )
    return list(result)


async def update_workflow(
    db: AsyncSession,
    org_id: uuid.UUID,
    workflow_id: uuid.UUID,
    *,
    name: str | None = None,
    trigger_type: str | None = None,
    trigger_config: dict | None = None,
    steps: list | None = None,
    is_active: bool | None = None,
) -> Workflow:
    wf = await get_workflow(db, org_id, workflow_id)
    if name is not None:
        wf.name = name
    if trigger_type is not None:
        wf.trigger_type = WorkflowTriggerType(trigger_type)
    if trigger_config is not None:
        wf.trigger_config = trigger_config
    if steps is not None:
        wf.steps = steps
    if is_active is not None:
        wf.is_active = is_active
    wf.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(wf)
    return wf


async def delete_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID) -> None:
    wf = await get_workflow(db, org_id, workflow_id)
    # Enrollments (and their step logs) reference the workflow; remove them first.
    enrollment_ids = select(WorkflowEnrollment.id).where(WorkflowEnrollment.workflow_id == workflow_id)
    await db.execute(delete(WorkflowStepLog).where(WorkflowStepLog.enrollment_id.in_(enrollment_ids)))
    await db.execute(delete(WorkflowEnrollment).where(WorkflowEnrollment.workflow_id == workflow_id))
    await db.delete(wf)
    await db.commit()


async def enrollment_counts(db: AsyncSession, workflow_id: uuid.UUID) -> dict:
    total = await db.scalar(
        select(func.count())
        .select_from(WorkflowEnrollment)
        .where(WorkflowEnrollment.workflow_id == workflow_id)
    ) or 0
    active = await db.scalar(
        select(func.count())
        .select_from(WorkflowEnrollment)
        .where(
            WorkflowEnrollment.workflow_id == workflow_id,
            WorkflowEnrollment.status == WorkflowEnrollmentStatus.ACTIVE,
        )
    ) or 0
    completed = await db.scalar(
        select(func.count())
        .select_from(WorkflowEnrollment)
        .where(
            WorkflowEnrollment.workflow_id == workflow_id,
            WorkflowEnrollment.status == WorkflowEnrollmentStatus.COMPLETED,
        )
    ) or 0
    return {"enrollment_count": total, "active_count": active, "completed_count": completed}


# ── Enrollment helpers (used by both service and runner) ──────────────────────


async def enroll_contact(
    db: AsyncSession,
    workflow: Workflow,
    contact_id: uuid.UUID,
) -> WorkflowEnrollment:
    """Creates an enrollment.  Raises ContactAlreadyEnrolledError if the contact
    is already *active* in this workflow (prevents duplicate journeys)."""
    existing = await db.scalar(
        select(WorkflowEnrollment).where(
            WorkflowEnrollment.workflow_id == workflow.id,
            WorkflowEnrollment.contact_id == contact_id,
            WorkflowEnrollment.status == WorkflowEnrollmentStatus.ACTIVE,
        )
    )
    if existing is not None:
        raise ContactAlreadyEnrolledError(contact_id)

    enrollment = WorkflowEnrollment(
        organization_id=workflow.organization_id,
        workflow_id=workflow.id,
        contact_id=contact_id,
    )
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)
    return enrollment


async def get_enrollments(
    db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID
) -> list[WorkflowEnrollment]:
    result = await db.scalars(
        select(WorkflowEnrollment)
        .where(
            WorkflowEnrollment.organization_id == org_id,
            WorkflowEnrollment.workflow_id == workflow_id,
        )
        .order_by(WorkflowEnrollment.enrolled_at.desc())
        .limit(100)
    )
    return list(result)


async def get_step_logs(db: AsyncSession, enrollment_id: uuid.UUID) -> list[WorkflowStepLog]:
    result = await db.scalars(
        select(WorkflowStepLog)
        .where(WorkflowStepLog.enrollment_id == enrollment_id)
        .order_by(WorkflowStepLog.executed_at)
    )
    return list(result)


async def get_contact_for_enrollment(
    db: AsyncSession, contact_id: uuid.UUID
) -> Contact | None:
    return await db.scalar(select(Contact).where(Contact.id == contact_id))


# ── Trigger matching (used by runner to decide which workflows fire) ───────────


async def find_matching_workflows(
    db: AsyncSession,
    org_id: uuid.UUID,
    trigger_type: str,
    trigger_data: dict,
) -> list[Workflow]:
    """Returns active workflows in the org that match the trigger."""
    result = await db.scalars(
        select(Workflow).where(
            Workflow.organization_id == org_id,
            Workflow.trigger_type == WorkflowTriggerType(trigger_type),
            Workflow.is_active.is_(True),
        )
    )
    workflows = list(result)
    matched = []
    for wf in workflows:
        if _matches_config(wf, trigger_type, trigger_data):
            matched.append(wf)
    return matched


def _matches_config(wf: Workflow, trigger_type: str, trigger_data: dict) -> bool:
    config = wf.trigger_config or {}
    if trigger_type == "tag_added":
        required_tag = config.get("tag")
        if required_tag and required_tag != trigger_data.get("tag"):
            return False
    if trigger_type == "stage_entered":
        required_stage = config.get("stage_id")
        if required_stage and required_stage != trigger_data.get("stage_id"):
            return False
    if trigger_type == "form_submitted":
        required_page = config.get("landing_page_id")
        if required_page and required_page != trigger_data.get("landing_page_id"):
            return False
    return True
