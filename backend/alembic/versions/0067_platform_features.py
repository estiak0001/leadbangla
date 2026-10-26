"""Platform feature switches (turn customer-facing services on or off)

Revision ID: 0067
Revises: 0066
"""
import sqlalchemy as sa
from alembic import op

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None

FEATURES = [
    ("whatsapp", "WhatsApp", "WhatsApp campaigns and conversations. Off for now: the messaging cost per conversation is not settled.", False),
    ("sms", "SMS", "SMS campaigns, sender IDs and the SMS wallet charges.", True),
    ("push", "Push notifications", "Web push campaigns.", True),
    ("social", "Social media", "Social account connections and scheduled posts.", True),
    ("paid_ads", "Paid ads", "Paid advertising accounts and spend tracking.", True),
    ("seo", "SEO audit", "On-page SEO audits.", True),
]


def upgrade() -> None:
    op.create_table(
        "platform_features",
        sa.Column("code", sa.String(40), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("updated_by", sa.String(255)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    t = sa.table("platform_features", sa.column("code"), sa.column("name"), sa.column("description"), sa.column("is_enabled"))
    op.bulk_insert(t, [{"code": c, "name": n, "description": d, "is_enabled": e} for c, n, d, e in FEATURES])


def downgrade() -> None:
    op.drop_table("platform_features")
