"""create push notification tables

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("provider", sa.String(30), nullable=False, server_default="vapid"),
        sa.Column("vapid_public_key", sa.Text(), nullable=True),
        sa.Column("vapid_private_key", sa.Text(), nullable=True),
        sa.Column("vapid_subject", sa.String(200), nullable=True),
        sa.Column("onesignal_app_id", sa.String(200), nullable=True),
        sa.Column("onesignal_api_key", sa.Text(), nullable=True),
        sa.Column("fcm_server_key", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_configs_org", "push_configs", ["organization_id"])

    op.create_table(
        "push_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth_secret", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_tokens_org", "push_tokens", ["organization_id"])
    op.create_index("ix_push_tokens_contact", "push_tokens", ["contact_id"])

    op.create_table(
        "push_campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("icon_url", sa.String(2000), nullable=True),
        sa.Column("click_url", sa.String(2000), nullable=True),
        sa.Column(
            "segment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("segments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("provider", sa.String(30), nullable=False, server_default="vapid"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_push_campaigns_org", "push_campaigns", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_push_campaigns_org", "push_campaigns")
    op.drop_table("push_campaigns")
    op.drop_index("ix_push_tokens_contact", "push_tokens")
    op.drop_index("ix_push_tokens_org", "push_tokens")
    op.drop_table("push_tokens")
    op.drop_index("ix_push_configs_org", "push_configs")
    op.drop_table("push_configs")
