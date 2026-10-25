"""add plan limits and credit rates

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-02

"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

CREDIT_RATE_ROWS = [
    {
        "id": uuid.uuid4(),
        "service": "sms",
        "rate_bdt": 1.0,
        "unit_label": "per SMS",
        "description": "Domestic BD SMS via SSL Wireless",
    },
    {
        "id": uuid.uuid4(),
        "service": "whatsapp",
        "rate_bdt": 5.0,
        "unit_label": "per conversation",
        "description": "WhatsApp via SSL Wireless BSP",
    },
    {
        "id": uuid.uuid4(),
        "service": "email_overage",
        "rate_bdt": 8.0,
        "unit_label": "per 1,000 emails",
        "description": "Email sends beyond monthly plan limit",
    },
    {
        "id": uuid.uuid4(),
        "service": "seo_query",
        "rate_bdt": 2.0,
        "unit_label": "per query",
        "description": "DataForSEO SERP/backlink API call",
    },
]


def upgrade() -> None:
    # 1. Add limit columns to existing plans table
    op.add_column("plans", sa.Column("contacts_limit", sa.Integer(), nullable=False, server_default="2000"))
    op.add_column("plans", sa.Column("emails_monthly_limit", sa.Integer(), nullable=False, server_default="10000"))
    op.add_column("plans", sa.Column("team_members_limit", sa.Integer(), nullable=False, server_default="2"))
    op.add_column("plans", sa.Column("workflows_limit", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("plans", sa.Column("landing_pages_limit", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("plans", sa.Column("social_accounts_limit", sa.Integer(), nullable=False, server_default="2"))
    op.add_column("plans", sa.Column("seo_credits_monthly", sa.Integer(), nullable=False, server_default="50"))
    op.add_column("plans", sa.Column("custom_domain", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("plans", sa.Column("priority_support", sa.Boolean(), nullable=False, server_default="false"))
    # -1 = unlimited (used for Enterprise plan)

    # 2. Update existing plan rows with correct limits by plan code.
    # Note: this repo's seed plans (0002) are starter/growth/pro, not
    # starter/growth/enterprise — cover all three known codes plus a
    # generic fallback so no plan is left at the server_default forever.
    op.execute(
        """
        UPDATE plans SET
            contacts_limit = CASE code
                WHEN 'starter' THEN 2000
                WHEN 'growth'  THEN 25000
                WHEN 'pro'     THEN -1
                ELSE contacts_limit
            END,
            emails_monthly_limit = CASE code
                WHEN 'starter' THEN 10000
                WHEN 'growth'  THEN 75000
                WHEN 'pro'     THEN 300000
                ELSE emails_monthly_limit
            END,
            team_members_limit = CASE code
                WHEN 'starter' THEN 2
                WHEN 'growth'  THEN 5
                WHEN 'pro'     THEN -1
                ELSE team_members_limit
            END,
            workflows_limit = CASE code
                WHEN 'starter' THEN 3
                WHEN 'growth'  THEN 20
                WHEN 'pro'     THEN -1
                ELSE workflows_limit
            END,
            landing_pages_limit = CASE code
                WHEN 'starter' THEN 3
                WHEN 'growth'  THEN 20
                WHEN 'pro'     THEN -1
                ELSE landing_pages_limit
            END,
            social_accounts_limit = CASE code
                WHEN 'starter' THEN 2
                WHEN 'growth'  THEN 10
                WHEN 'pro'     THEN -1
                ELSE social_accounts_limit
            END,
            seo_credits_monthly = CASE code
                WHEN 'starter' THEN 50
                WHEN 'growth'  THEN 300
                WHEN 'pro'     THEN 1000
                ELSE seo_credits_monthly
            END,
            custom_domain = (code IN ('growth', 'pro')),
            priority_support = (code = 'pro')
        WHERE code IN ('starter', 'growth', 'pro')
        """
    )

    # 3. Create credit_rates table
    credit_rates_table = op.create_table(
        "credit_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("service", sa.String(30), nullable=False),
        sa.Column("rate_bdt", sa.Numeric(10, 4), nullable=False),
        sa.Column("unit_label", sa.String(50), nullable=False),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_by", sa.String(100), nullable=True),
    )
    op.create_index("ix_credit_rates_service", "credit_rates", ["service"], unique=True)

    # 4. Seed credit_rates with 4 rows
    op.bulk_insert(credit_rates_table, CREDIT_RATE_ROWS)


def downgrade() -> None:
    op.drop_index("ix_credit_rates_service", table_name="credit_rates")
    op.drop_table("credit_rates")
    for col in [
        "contacts_limit",
        "emails_monthly_limit",
        "team_members_limit",
        "workflows_limit",
        "landing_pages_limit",
        "social_accounts_limit",
        "seo_credits_monthly",
        "custom_domain",
        "priority_support",
    ]:
        op.drop_column("plans", col)
