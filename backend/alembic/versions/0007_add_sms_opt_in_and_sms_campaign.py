"""add sms opt-in columns and sms_campaigns / sms_events / sms_skip_events tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-30

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── Opt-in columns on contacts ────────────────────────────────────────────
    op.add_column("contacts", sa.Column("sms_opt_in", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("contacts", sa.Column("whatsapp_opt_in", sa.Boolean(), nullable=False, server_default="false"))

    # ── New enum types ────────────────────────────────────────────────────────
    postgresql.ENUM("sms", "whatsapp", name="sms_channel").create(bind, checkfirst=True)
    sms_channel_enum = postgresql.ENUM("sms", "whatsapp", name="sms_channel", create_type=False)

    postgresql.ENUM("draft", "sending", "sent", "failed", name="sms_campaign_status").create(
        bind, checkfirst=True
    )
    sms_campaign_status_enum = postgresql.ENUM(
        "draft", "sending", "sent", "failed", name="sms_campaign_status", create_type=False
    )

    postgresql.ENUM("sent", "delivered", "failed", name="sms_event_type").create(bind, checkfirst=True)
    sms_event_type_enum = postgresql.ENUM(
        "sent", "delivered", "failed", name="sms_event_type", create_type=False
    )

    # ── sms_campaigns ─────────────────────────────────────────────────────────
    op.create_table(
        "sms_campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("segment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("segments.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("channel", sms_channel_enum, nullable=False),
        sa.Column("status", sms_campaign_status_enum, nullable=False, server_default="draft"),
        sa.Column("sender_id", sa.String(20), nullable=False, server_default="LeadBangla"),
        sa.Column("message_body", sa.Text(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sms_campaigns_organization_id", "sms_campaigns", ["organization_id"])

    # ── sms_events ────────────────────────────────────────────────────────────
    op.create_table(
        "sms_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "sms_campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sms_campaigns.id"),
            nullable=False,
        ),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("phone", sa.String(32), nullable=False),
        sa.Column("type", sms_event_type_enum, nullable=False),
        sa.Column("gateway_message_id", sa.String(200), nullable=True),
        sa.Column("opted_out_skip", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sms_events_organization_id", "sms_events", ["organization_id"])
    op.create_index("ix_sms_events_sms_campaign_id", "sms_events", ["sms_campaign_id"])

    # ── sms_skip_events ───────────────────────────────────────────────────────
    op.create_table(
        "sms_skip_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "sms_campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sms_campaigns.id"),
            nullable=False,
        ),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("phone", sa.String(32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sms_skip_events_organization_id", "sms_skip_events", ["organization_id"])
    op.create_index("ix_sms_skip_events_sms_campaign_id", "sms_skip_events", ["sms_campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_sms_skip_events_sms_campaign_id", table_name="sms_skip_events")
    op.drop_index("ix_sms_skip_events_organization_id", table_name="sms_skip_events")
    op.drop_table("sms_skip_events")
    op.drop_index("ix_sms_events_sms_campaign_id", table_name="sms_events")
    op.drop_index("ix_sms_events_organization_id", table_name="sms_events")
    op.drop_table("sms_events")
    op.drop_index("ix_sms_campaigns_organization_id", table_name="sms_campaigns")
    op.drop_table("sms_campaigns")
    postgresql.ENUM(name="sms_event_type").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="sms_campaign_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="sms_channel").drop(op.get_bind(), checkfirst=True)
    op.drop_column("contacts", "whatsapp_opt_in")
    op.drop_column("contacts", "sms_opt_in")
