import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import (
    WorkflowEnrollmentStatus,
    WorkflowStepStatus,
    WorkflowTriggerType,
)

_ev = lambda e: [m.value for m in e]  # noqa: E731  (values_callable shorthand)


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    trigger_type: Mapped[WorkflowTriggerType] = mapped_column(
        SAEnum(WorkflowTriggerType, values_callable=_ev, name="workflowtriggertype"),
        nullable=False,
    )
    # Extra filter for the trigger — e.g. {"tag": "vip"} for TAG_ADDED.
    trigger_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Ordered list of step objects:
    #   {type:"send_email", subject, html_body}
    #   {type:"send_sms", message}
    #   {type:"wait", delay_hours, delay_minutes, delay_seconds}
    #   {type:"add_tag"|"remove_tag", tag}
    #   {type:"if_then", condition:{field,operator,value}, then_step:{...}, else_step:{...}}
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkflowEnrollment(Base):
    """Tracks one contact's progress through a workflow journey."""

    __tablename__ = "workflow_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id"), nullable=False, index=True
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=False, index=True
    )
    current_step_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[WorkflowEnrollmentStatus] = mapped_column(
        SAEnum(WorkflowEnrollmentStatus, values_callable=_ev, name="workflowenrollmentstatus"),
        nullable=False,
        default=WorkflowEnrollmentStatus.ACTIVE,
        server_default=WorkflowEnrollmentStatus.ACTIVE.value,
    )
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class WorkflowStepLog(Base):
    """Immutable record of every step execution for an enrollment."""

    __tablename__ = "workflow_step_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_enrollments.id"), nullable=False, index=True
    )
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    step_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[WorkflowStepStatus] = mapped_column(
        SAEnum(WorkflowStepStatus, values_callable=_ev, name="workflowstepstatus"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
