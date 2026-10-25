"""create org notification settings

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-02

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_notification_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("low_balance_alert", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("usage_limit_alert", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("low_balance_threshold_bdt", sa.Numeric(10, 2), nullable=False, server_default="50"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("org_notification_settings")
