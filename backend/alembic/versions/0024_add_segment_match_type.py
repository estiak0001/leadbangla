"""add match_type to segments

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "segments",
        sa.Column("match_type", sa.String(length=3), nullable=False, server_default="all"),
    )


def downgrade() -> None:
    op.drop_column("segments", "match_type")
