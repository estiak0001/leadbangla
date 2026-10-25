"""remove SendGrid: BYOK sender table, plan flag, platform service row

Revision ID: 0038
Revises: 0037
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM platform_services WHERE code = 'sendgrid'")
    op.drop_table("org_email_senders")
    op.drop_column("plans", "email_byok_allowed")


def downgrade() -> None:
    op.add_column("plans", sa.Column("email_byok_allowed", sa.Boolean(), nullable=False, server_default="false"))
    # org_email_senders and the SendGrid service row are intentionally not recreated.
