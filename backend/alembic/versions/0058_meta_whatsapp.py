"""Meta WhatsApp Cloud API: platform service, per-org phone number id, campaign template

Revision ID: 0058
Revises: 0057
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sms_campaigns", sa.Column("wa_template", postgresql.JSONB(), nullable=True))
    op.add_column("organizations", sa.Column("whatsapp_phone_number_id", sa.String(40), nullable=True))
    op.execute(
        sa.text(
            "INSERT INTO platform_services (id, code, name, category, description, docs_url, cost_model, est_monthly_usd, is_enabled, is_live) "
            "SELECT :id, 'meta_whatsapp', 'WhatsApp Cloud API (Meta)', 'whatsapp', "
            "'Send WhatsApp messages directly through Meta, with no provider in between', "
            "'https://developers.facebook.com/docs/whatsapp/cloud-api', 'Meta per-message rates; no monthly provider fee', 0, true, false "
            "WHERE NOT EXISTS (SELECT 1 FROM platform_services WHERE code = 'meta_whatsapp')"
        ).bindparams(id=uuid.uuid4())
    )
    op.execute("UPDATE platform_services SET name = 'WhatsApp via SSL Wireless (old)', description = 'Older route through a provider. Use the Meta Cloud API instead.' WHERE code = 'whatsapp_bsp'")


def downgrade() -> None:
    op.execute("DELETE FROM platform_services WHERE code = 'meta_whatsapp'")
    op.drop_column("organizations", "whatsapp_phone_number_id")
    op.drop_column("sms_campaigns", "wa_template")
