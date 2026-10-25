"""organization suspension + staff notes

Revision ID: 0046
Revises: 0045
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("is_suspended", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organizations", sa.Column("suspended_reason", sa.String(length=300), nullable=True))
    op.add_column("organizations", sa.Column("internal_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "internal_notes")
    op.drop_column("organizations", "suspended_reason")
    op.drop_column("organizations", "is_suspended")
