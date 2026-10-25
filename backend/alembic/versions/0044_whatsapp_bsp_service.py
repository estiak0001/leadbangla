"""whatsapp business (BSP) platform service

Revision ID: 0044
Revises: 0043
Create Date: 2026-10-18

"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO platform_services (id, code, name, category, description, docs_url, cost_model, est_monthly_usd, is_enabled, is_live) "
            "SELECT :id, 'whatsapp_bsp', 'WhatsApp Business', 'whatsapp', "
            "'WhatsApp Business messaging through an approved Business Solution Provider (BSP)', "
            "'https://developers.facebook.com/docs/whatsapp', '~৳5 per conversation (Meta pricing via your BSP)', 0, true, false "
            "WHERE NOT EXISTS (SELECT 1 FROM platform_services WHERE code = 'whatsapp_bsp')"
        ).bindparams(id=uuid.uuid4())
    )


def downgrade() -> None:
    op.execute("DELETE FROM platform_services WHERE code = 'whatsapp_bsp'")
