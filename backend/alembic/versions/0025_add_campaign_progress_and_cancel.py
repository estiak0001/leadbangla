"""add campaign progress tracking, cancel flag, and cancelled status

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'cancelled'")
    op.add_column("campaigns", sa.Column("total_recipients", sa.Integer(), nullable=True))
    op.add_column(
        "campaigns",
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("campaigns", "cancel_requested")
    op.drop_column("campaigns", "total_recipients")
    # Postgres has no DROP VALUE for enums; leaving 'cancelled' in campaign_status is harmless.
