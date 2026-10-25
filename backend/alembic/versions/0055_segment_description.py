"""Segments: description

Revision ID: 0055
Revises: 0054
"""
import sqlalchemy as sa
from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("segments", sa.Column("description", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("segments", "description")
