"""Locations master table (per company; seeded with Bangladesh's 64 districts)

Revision ID: 0052
Revises: 0051
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("name_bn", sa.String(100), nullable=True),
        sa.Column("division", sa.String(60), nullable=True),
        sa.Column("kind", sa.String(10), nullable=False, server_default="district"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("uq_locations_org_name", "locations", ["organization_id", sa.text("lower(name)")], unique=True)
    op.add_column("crm_settings", sa.Column("locations_seeded", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("crm_settings", "locations_seeded")
    op.drop_index("uq_locations_org_name", "locations")
    op.drop_table("locations")
