"""sending domain verification timestamps

Revision ID: 0039
Revises: 0038
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sending_domains", sa.Column("dns_submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sending_domains", sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("sending_domains", "last_checked_at")
    op.drop_column("sending_domains", "dns_submitted_at")
