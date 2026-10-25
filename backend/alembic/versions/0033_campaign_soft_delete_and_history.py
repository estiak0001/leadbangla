"""add campaign soft delete and history

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("campaigns", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_campaigns_deleted_at", "campaigns", ["deleted_at"])
    op.create_table(
        "campaign_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("changed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("changes", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("source_history_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaign_history.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_campaign_history_organization_id", "campaign_history", ["organization_id"])
    op.create_index("ix_campaign_history_campaign_id", "campaign_history", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_campaign_history_campaign_id", table_name="campaign_history")
    op.drop_index("ix_campaign_history_organization_id", table_name="campaign_history")
    op.drop_table("campaign_history")
    op.drop_index("ix_campaigns_deleted_at", table_name="campaigns")
    op.drop_column("campaigns", "deleted_at")
