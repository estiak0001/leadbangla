"""soft delete for sending domains

Revision ID: 0037
Revises: 0036
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sending_domains", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_sending_domains_deleted_at", "sending_domains", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_sending_domains_deleted_at", table_name="sending_domains")
    op.drop_column("sending_domains", "deleted_at")
