"""Celery tasks for the workflow engine.

Two entry points:
  fire_workflow_trigger_task — called when a trigger event occurs (contact
    created, form submitted, manual). Finds matching active workflows, enrolls
    the contact if not already active, then kicks off the first step.

  execute_workflow_step_task — processes the next pending step for one
    enrollment.  Steps are executed synchronously in a loop.  A "wait" step
    breaks the loop and re-schedules this task via Celery ETA so execution
    resumes after the delay.
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal, engine
from app.integrations.email_client import email_client
from app.integrations.sslwireless import SSLWirelessClient
from app.models.contact import Contact
from app.models.enums import WorkflowEnrollmentStatus, WorkflowStepStatus
from app.models.workflow import Workflow, WorkflowEnrollment, WorkflowStepLog
from app.services.workflow_service import (
    ContactAlreadyEnrolledError,
    enroll_contact,
    find_matching_workflows,
)
from app.workers.celery_app import celery_app

sslwireless_client = SSLWirelessClient()


# ── Template rendering ────────────────────────────────────────────────────────


def _render(text: str, contact: Contact) -> str:
    subs = {
        "{{first_name}}": contact.first_name or "",
        "{{last_name}}": contact.last_name or "",
        "{{email}}": contact.email or "",
        "{{phone}}": contact.phone or "",
    }
    for k, v in subs.items():
        text = text.replace(k, v)
    return text


# ── Condition evaluation (for if_then steps) ──────────────────────────────────


def _evaluate_condition(contact: Contact, condition: dict) -> bool:
    field = condition.get("field", "")
    op = condition.get("operator", "is_set")
    value = condition.get("value", "")
    field_val = getattr(contact, field, None) if field != "tags" else contact.tags

    if op == "is_set":
        return bool(field_val)
    if op == "is_not_set":
        return not bool(field_val)
    if op == "has_tag":
        return value in (contact.tags or [])
    if op == "not_has_tag":
        return value not in (contact.tags or [])
    return False


# ── Single-step executor ──────────────────────────────────────────────────────


async def _execute_step(
    db: AsyncSession,
    step: dict,
    contact: Contact,
) -> dict:
    """Execute one step.  Returns {"status": "executed"} or {"status": "waiting", "eta": datetime}."""
    step_type = step.get("type", "")

    if step_type == "send_email":
        if contact.email:
            subject = _render(step.get("subject", "(no subject)"), contact)
            html_body = _render(step.get("html_body", ""), contact)
            await email_client.send_email(
                db, org_id=contact.organization_id, to_email=contact.email, subject=subject, html_body=html_body
            )
            return {"status": "executed", "notes": f"Sent to {contact.email}"}
        return {"status": "skipped", "notes": "Contact has no email"}

    if step_type == "send_sms":
        if not contact.phone:
            return {"status": "skipped", "notes": "Contact has no phone"}
        if not contact.sms_opt_in:
            return {"status": "skipped", "notes": "Contact not opted-in for SMS"}
        msg = _render(step.get("message", ""), contact)
        from app.integrations import sms_gateway  # noqa: PLC0415
        from app.services.sms_service import resolve_effective_sender_id  # noqa: PLC0415

        sender = await resolve_effective_sender_id(db, contact.organization_id)
        await sms_gateway.send_sms(db, to=contact.phone, message=msg, sender_id=sender)
        return {"status": "executed", "notes": f"SMS sent to {contact.phone}"}

    if step_type == "wait":
        delay_s = (
            float(step.get("delay_hours", 0)) * 3600
            + float(step.get("delay_minutes", 0)) * 60
            + float(step.get("delay_seconds", 0))
        )
        eta = datetime.now(timezone.utc) + timedelta(seconds=max(delay_s, 1))
        return {"status": "waiting", "eta": eta}

    if step_type == "add_tag":
        tag = step.get("tag", "")
        if tag and tag not in (contact.tags or []):
            contact.tags = sorted(set(contact.tags or []) | {tag})
        return {"status": "executed", "notes": f"Added tag '{tag}'"}

    if step_type == "remove_tag":
        tag = step.get("tag", "")
        if tag:
            contact.tags = [t for t in (contact.tags or []) if t != tag]
        return {"status": "executed", "notes": f"Removed tag '{tag}'"}

    if step_type == "move_to_stage":
        from app.models.crm import PipelineStage  # noqa: PLC0415
        from app.services.crm_service import log_activity  # noqa: PLC0415

        raw = step.get("stage_id")
        try:
            stage = await db.get(PipelineStage, uuid.UUID(str(raw))) if raw else None
        except ValueError:
            stage = None
        if stage is None or stage.organization_id != contact.organization_id:
            return {"status": "skipped", "notes": "Stage no longer exists"}
        if contact.pipeline_stage_id != stage.id:
            contact.pipeline_stage_id = stage.id
            contact.stage_changed_at = datetime.now(timezone.utc)
            await log_activity(db, contact.organization_id, contact.id, "stage_change",
                               f"Automation moved lead to {stage.name}", None, {"to": str(stage.id), "auto": True})
        return {"status": "executed", "notes": f"Moved to stage '{stage.name}'"}

    if step_type == "if_then":
        condition = step.get("condition", {})
        matched = _evaluate_condition(contact, condition)
        sub_step = step.get("then_step" if matched else "else_step")
        notes = f"Condition {'matched' if matched else 'did not match'}"
        if sub_step:
            sub_result = await _execute_step(db, sub_step, contact)
            notes += f" → {sub_result.get('notes', '')}"
        return {"status": "executed", "notes": notes}

    return {"status": "skipped", "notes": f"Unknown step type '{step_type}'"}


# ── Main execution loop ───────────────────────────────────────────────────────


async def _execute_workflow_step(enrollment_id: str) -> None:
    async with AsyncSessionLocal() as db:
        enrollment = await db.scalar(
            select(WorkflowEnrollment).where(WorkflowEnrollment.id == uuid.UUID(enrollment_id))
        )
        if enrollment is None or enrollment.status != WorkflowEnrollmentStatus.ACTIVE:
            return

        workflow = await db.scalar(select(Workflow).where(Workflow.id == enrollment.workflow_id))
        if not workflow:
            return

        contact = await db.scalar(
            select(Contact).where(Contact.id == enrollment.contact_id, Contact.deleted_at.is_(None))
        )
        if not contact:
            return

        steps = workflow.steps or []

        while enrollment.current_step_index < len(steps):
            step = steps[enrollment.current_step_index]
            step_idx = enrollment.current_step_index

            try:
                result = await _execute_step(db, step, contact)
            except Exception as exc:
                db.add(
                    WorkflowStepLog(
                        enrollment_id=enrollment.id,
                        step_index=step_idx,
                        step_type=step.get("type", "unknown"),
                        status=WorkflowStepStatus.FAILED,
                        notes=str(exc),
                    )
                )
                enrollment.status = WorkflowEnrollmentStatus.FAILED
                enrollment.error_message = str(exc)
                await db.commit()
                return

            status_val = result["status"]
            log_status = (
                WorkflowStepStatus.EXECUTED
                if status_val in ("executed", "waiting")
                else WorkflowStepStatus.SKIPPED
            )
            db.add(
                WorkflowStepLog(
                    enrollment_id=enrollment.id,
                    step_index=step_idx,
                    step_type=step.get("type", "unknown"),
                    status=log_status,
                    notes=result.get("notes"),
                )
            )

            # Advance past the current step (including the wait step).
            enrollment.current_step_index += 1

            if status_val == "waiting":
                eta = result["eta"]
                await db.commit()
                # Schedule the next execution after the wait period.
                execute_workflow_step_task.apply_async(
                    args=[enrollment_id], eta=eta
                )
                return  # stop; Celery resumes when eta fires

        # All steps exhausted — journey complete.
        enrollment.status = WorkflowEnrollmentStatus.COMPLETED
        enrollment.completed_at = datetime.now(timezone.utc)
        await db.commit()

    await engine.dispose()


async def _fire_workflow_trigger(
    org_id: str, trigger_type: str, contact_id: str, trigger_data: dict
) -> None:
    async with AsyncSessionLocal() as db:
        matching = await find_matching_workflows(
            db, uuid.UUID(org_id), trigger_type, trigger_data
        )
        for wf in matching:
            try:
                enrollment = await enroll_contact(db, wf, uuid.UUID(contact_id))
            except ContactAlreadyEnrolledError:
                continue  # contact is already actively running this workflow
            # Start executing immediately.
            execute_workflow_step_task.delay(str(enrollment.id))

    await engine.dispose()


# ── Celery tasks ──────────────────────────────────────────────────────────────


@celery_app.task(name="execute_workflow_step_task")
def execute_workflow_step_task(enrollment_id: str) -> None:
    asyncio.run(_execute_workflow_step(enrollment_id))


@celery_app.task(name="fire_workflow_trigger_task")
def fire_workflow_trigger_task(
    org_id: str, trigger_type: str, contact_id: str, trigger_data: dict
) -> None:
    asyncio.run(_fire_workflow_trigger(org_id, trigger_type, contact_id, trigger_data))
