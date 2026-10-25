"""create platform services

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-02

"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

PLATFORM_SERVICE_ROWS = [
    {
        "id": uuid.uuid4(),
        "code": "sslcommerz",
        "name": "SSLCommerz",
        "category": "payment",
        "description": "Payment gateway for BDT subscriptions and wallet top-ups (cards, bKash, Nagad, Rocket, Upay)",
        "docs_url": "https://developer.sslcommerz.com/doc/v4/",
        "cost_model": "~2.5-3.5% + VAT per transaction",
        "est_monthly_usd": 0,
    },
    {
        "id": uuid.uuid4(),
        "code": "sendgrid",
        "name": "SendGrid Email",
        "category": "email",
        "description": "Transactional and campaign email delivery",
        "docs_url": "https://docs.sendgrid.com/api-reference/",
        "cost_model": "Free 100/day; $19.95/mo Essentials (50K emails)",
        "est_monthly_usd": 20,
    },
    {
        "id": uuid.uuid4(),
        "code": "sslwireless",
        "name": "SSL Wireless SMS",
        "category": "sms",
        "description": "BTRC-recognized SMS and WhatsApp BSP for Bangladesh market",
        "docs_url": "https://sms.sslwireless.com/pushapi/",
        "cost_model": "~0.30-0.50 BDT/SMS (variable)",
        "est_monthly_usd": 0,
    },
    {
        "id": uuid.uuid4(),
        "code": "meta_social",
        "name": "Meta Graph API",
        "category": "social",
        "description": "Facebook and Instagram page post publishing and stats",
        "docs_url": "https://developers.facebook.com/docs/graph-api/",
        "cost_model": "Free",
        "est_monthly_usd": 0,
    },
    {
        "id": uuid.uuid4(),
        "code": "linkedin",
        "name": "LinkedIn Marketing API",
        "category": "social",
        "description": "LinkedIn organization post publishing (requires MDP approval)",
        "docs_url": "https://learn.microsoft.com/en-us/linkedin/marketing/",
        "cost_model": "Free",
        "est_monthly_usd": 0,
    },
    {
        "id": uuid.uuid4(),
        "code": "firebase_vapid",
        "name": "Firebase / VAPID Push",
        "category": "push",
        "description": "Web push notifications via VAPID protocol (FCM-backed)",
        "docs_url": "https://firebase.google.com/docs/cloud-messaging",
        "cost_model": "Free",
        "est_monthly_usd": 0,
    },
    {
        "id": uuid.uuid4(),
        "code": "dataseo",
        "name": "DataForSEO",
        "category": "seo",
        "description": "Rank tracking, SERP data, and backlink analysis",
        "docs_url": "https://docs.dataforseo.com/",
        "cost_model": "~$50-300/mo usage-based",
        "est_monthly_usd": 150,
    },
    {
        "id": uuid.uuid4(),
        "code": "twitter_x",
        "name": "Twitter / X API",
        "category": "social",
        "description": "Tweet publishing via X API Basic tier",
        "docs_url": "https://developer.twitter.com/en/docs/twitter-api",
        "cost_model": "$200/mo Basic tier",
        "est_monthly_usd": 200,
    },
]


def upgrade() -> None:
    platform_services_table = op.create_table(
        "platform_services",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("docs_url", sa.String(300), nullable=True),
        sa.Column("cost_model", sa.String(200), nullable=True),
        sa.Column("est_monthly_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_live", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("credentials_enc", sa.Text(), nullable=True),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_ok", sa.Boolean(), nullable=True),
        sa.Column("last_test_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_platform_services_code", "platform_services", ["code"], unique=True)

    op.bulk_insert(platform_services_table, PLATFORM_SERVICE_ROWS)


def downgrade() -> None:
    op.drop_index("ix_platform_services_code", table_name="platform_services")
    op.drop_table("platform_services")
