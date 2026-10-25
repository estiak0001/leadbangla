"""Segments: soft delete, change history, editable templates

Revision ID: 0056
Revises: 0055
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("segments", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("segments", sa.Column("is_template", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_segments_deleted_at", "segments", ["deleted_at"])
    op.add_column("crm_settings", sa.Column("segment_templates_seeded", sa.Boolean(), nullable=False, server_default="false"))
    op.create_table(
        "segment_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("segment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("segments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("changes", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("segment_history")
    op.drop_column("crm_settings", "segment_templates_seeded")
    op.drop_index("ix_segments_deleted_at", "segments")
    op.drop_column("segments", "is_template")
    op.drop_column("segments", "deleted_at")
