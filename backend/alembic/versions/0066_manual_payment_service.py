"""Payment-method settings row for manual (bKash/Nagad/Rocket/bank) payments

Revision ID: 0066
Revises: 0065
"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(sa.text("select 1 from platform_services where code='manual_payment'")).first()
    if not exists:
        conn.execute(
            sa.text(
                "insert into platform_services (id, code, name, category, description, cost_model, est_monthly_usd, is_enabled, is_live) "
                "values (:id, 'manual_payment', 'Manual payments', 'payment', "
                "'bKash / Nagad / Rocket / bank transfer with proof, approved by staff', 'No gateway fee', 0, true, false)"
            ),
            {"id": uuid.uuid4()},
        )


    # Online gateway stays off until SSLCommerz is actually configured (saving its credentials turns it on).
    conn.execute(sa.text("update platform_services set is_enabled=false where code='sslcommerz' and credentials_enc is null"))


def downgrade() -> None:
    op.get_bind().execute(sa.text("delete from platform_services where code='manual_payment'"))
