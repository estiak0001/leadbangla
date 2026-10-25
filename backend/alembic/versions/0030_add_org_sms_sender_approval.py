"""add sms_sender_id_approved flag to organizations

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("sms_sender_id_approved", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("organizations", "sms_sender_id_approved", server_default=None)


def downgrade() -> None:
    op.drop_column("organizations", "sms_sender_id_approved")
