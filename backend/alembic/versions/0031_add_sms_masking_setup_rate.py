"""seed sms_masking_setup credit rate (one-time Sender ID request fee)

Revision ID: 0031
Revises: 0030
Create Date: 2026-07-06

"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            """
            INSERT INTO credit_rates (id, service, rate_bdt, unit_label, description, is_active)
            VALUES (:id, 'sms_masking_setup', 1000.0, 'one-time',
                    'One-time fee to request a custom masking Sender ID (BTRC/aggregator processing) — approximate market rate, adjust to your actual SSL Wireless quote',
                    true)
            """
        ),
        {"id": str(uuid.uuid4())},
    )


def downgrade() -> None:
    op.execute("DELETE FROM credit_rates WHERE service = 'sms_masking_setup'")
