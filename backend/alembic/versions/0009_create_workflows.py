"""create workflow tables

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-30

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    trigger_enum = postgresql.ENUM(
        "contact_created", "tag_added", "form_submitted", "manual",
        name="workflowtriggertype", create_type=False
    )
    trigger_enum.create(bind=bind, checkfirst=True)

    enrollment_enum = postgresql.ENUM(
        "active", "completed", "cancelled", "failed",
        name="workflowenrollmentstatus", create_type=False
    )
    enrollment_enum.create(bind=bind, checkfirst=True)

    step_status_enum = postgresql.ENUM(
        "executed", "skipped", "failed",
        name="workflowstepstatus", create_type=False
    )
    step_status_enum.create(bind=bind, checkfirst=True)

    op.create_table(
        "workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("trigger_type", trigger_enum, nullable=False),
        sa.Column("trigger_config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("steps", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_workflows_organization_id", "workflows", ["organization_id"])

    op.create_table(
        "workflow_enrollments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id"), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("current_step_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", enrollment_enum, nullable=False, server_default="active"),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_workflow_enrollments_organization_id", "workflow_enrollments", ["organization_id"])
    op.create_index("ix_workflow_enrollments_workflow_id", "workflow_enrollments", ["workflow_id"])
    op.create_index("ix_workflow_enrollments_contact_id", "workflow_enrollments", ["contact_id"])

    op.create_table(
        "workflow_step_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "enrollment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_enrollments.id"),
            nullable=False,
        ),
        sa.Column("step_index", sa.Integer(), nullable=False),
        sa.Column("step_type", sa.String(50), nullable=False),
        sa.Column("status", step_status_enum, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_workflow_step_logs_enrollment_id", "workflow_step_logs", ["enrollment_id"])


def downgrade() -> None:
    op.drop_index("ix_workflow_step_logs_enrollment_id", table_name="workflow_step_logs")
    op.drop_table("workflow_step_logs")
    op.drop_index("ix_workflow_enrollments_contact_id", table_name="workflow_enrollments")
    op.drop_index("ix_workflow_enrollments_workflow_id", table_name="workflow_enrollments")
    op.drop_index("ix_workflow_enrollments_organization_id", table_name="workflow_enrollments")
    op.drop_table("workflow_enrollments")
    op.drop_index("ix_workflows_organization_id", table_name="workflows")
    op.drop_table("workflows")
    op.execute("DROP TYPE IF EXISTS workflowstepstatus")
    op.execute("DROP TYPE IF EXISTS workflowenrollmentstatus")
    op.execute("DROP TYPE IF EXISTS workflowtriggertype")
