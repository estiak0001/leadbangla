"""Team access: member permissions/status, general tasks, team audit log

Revision ID: 0048
Revises: 0047
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_members", sa.Column("permissions", postgresql.JSONB(), nullable=True))
    op.add_column("organization_members", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("organization_members", sa.Column("invite_pending", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organization_members", sa.Column("job_title", sa.String(100), nullable=True))
    op.add_column("organization_members", sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.alter_column("crm_tasks", "contact_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("crm_tasks", sa.Column("priority", sa.String(10), nullable=False, server_default="normal"))
    op.add_column("crm_tasks", sa.Column("description", sa.Text(), nullable=True))

    op.create_table(
        "team_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("detail", sa.String(500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("team_audit_log")
    op.drop_column("crm_tasks", "description")
    op.drop_column("crm_tasks", "priority")
    op.alter_column("crm_tasks", "contact_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    for c in ["invited_by_user_id", "job_title", "invite_pending", "is_active", "permissions"]:
        op.drop_column("organization_members", c)
