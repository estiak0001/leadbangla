"""Team extras: last seen, invite time, task comments, access presets

Revision ID: 0049
Revises: 0048
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_members", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organization_members", sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE organization_members SET invited_at = created_at WHERE invite_pending")
    op.create_table(
        "crm_task_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "team_access_presets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("permissions", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_preset_org_name"),
    )


def downgrade() -> None:
    op.drop_table("team_access_presets")
    op.drop_table("crm_task_comments")
    op.drop_column("organization_members", "invited_at")
    op.drop_column("organization_members", "last_seen_at")
