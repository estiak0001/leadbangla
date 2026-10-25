"""subscription source / admin note / changed_by

Revision ID: 0045
Revises: 0044
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("source", sa.String(length=20), nullable=False, server_default="payment"))
    op.add_column("subscriptions", sa.Column("admin_note", sa.Text(), nullable=True))
    op.add_column("subscriptions", sa.Column("changed_by", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("subscriptions", "changed_by")
    op.drop_column("subscriptions", "admin_note")
    op.drop_column("subscriptions", "source")
