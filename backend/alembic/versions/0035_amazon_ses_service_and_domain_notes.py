"""register Amazon SES platform service, add domain status note

Revision ID: 0035
Revises: 0034
Create Date: 2026-10-18

"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sending_domains", sa.Column("status_note", sa.Text(), nullable=True))
    op.execute(
        sa.text(
            "INSERT INTO platform_services (id, code, name, category, description, docs_url, cost_model, est_monthly_usd, is_enabled, is_live) "
            "VALUES (:id, 'amazon_ses', 'Amazon SES Email', 'email', "
            "'Campaign and transactional email delivery with per-customer domain authentication (DKIM/SPF)', "
            "'https://docs.aws.amazon.com/ses/latest/dg/', '~$0.10 per 1,000 emails', 0, true, false) "
            "ON CONFLICT (code) DO NOTHING"
        ).bindparams(id=uuid.uuid4())
    )


def downgrade() -> None:
    op.execute("DELETE FROM platform_services WHERE code = 'amazon_ses'")
    op.drop_column("sending_domains", "status_note")
