"""create tag presets table

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-05

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tag_presets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_tag_presets_org_name"),
    )
    op.create_index("ix_tag_presets_organization_id", "tag_presets", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_tag_presets_organization_id", table_name="tag_presets")
    op.drop_table("tag_presets")
