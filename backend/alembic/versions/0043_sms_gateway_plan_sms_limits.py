"""alpha sms gateway row, plan sms limits, sms event errors, verification gateway fields

Revision ID: 0043
Revises: 0042
Create Date: 2026-10-18

"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alpha SMS as a platform service (credentials are set from the admin SMS Gateway page)
    op.execute(
        sa.text(
            "INSERT INTO platform_services (id, code, name, category, description, docs_url, cost_model, est_monthly_usd, is_enabled, is_live) "
            "SELECT :id, 'alphasms', 'Alpha SMS', 'sms', 'Bangladeshi bulk SMS gateway (sms.net.bd)', 'https://sms.bd/api', "
            "'~0.31-0.64 BDT/SMS depending on package', 0, true, false "
            "WHERE NOT EXISTS (SELECT 1 FROM platform_services WHERE code = 'alphasms')"
        ).bindparams(id=uuid.uuid4())
    )

    # Per-plan SMS entitlements
    op.add_column("plans", sa.Column("sms_enabled", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("plans", sa.Column("sms_monthly_limit", sa.Integer(), nullable=False, server_default="300"))
    op.add_column("plans", sa.Column("masking_allowed", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("plans", sa.Column("whatsapp_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.execute("UPDATE plans SET sms_monthly_limit = 300,   masking_allowed = false, whatsapp_enabled = false WHERE code = 'starter'")
    op.execute("UPDATE plans SET sms_monthly_limit = 3000,  masking_allowed = true,  whatsapp_enabled = true  WHERE code = 'growth'")
    op.execute("UPDATE plans SET sms_monthly_limit = 15000, masking_allowed = true,  whatsapp_enabled = true  WHERE code = 'pro'")

    op.add_column("sms_events", sa.Column("error", sa.String(length=255), nullable=True))
    op.add_column("verification_requests", sa.Column("gateway_ref", sa.String(length=100), nullable=True))
    op.add_column("verification_requests", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("verification_requests", "submitted_at")
    op.drop_column("verification_requests", "gateway_ref")
    op.drop_column("sms_events", "error")
    for c in ("whatsapp_enabled", "masking_allowed", "sms_monthly_limit", "sms_enabled"):
        op.drop_column("plans", c)
    op.execute("DELETE FROM platform_services WHERE code = 'alphasms'")
