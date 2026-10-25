"""create campaigns and events tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-24

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    postgresql.ENUM("email", name="campaign_channel").create(bind, checkfirst=True)
    campaign_channel_enum = postgresql.ENUM("email", name="campaign_channel", create_type=False)

    postgresql.ENUM("draft", "sending", "sent", "failed", name="campaign_status").create(
        bind, checkfirst=True
    )
    campaign_status_enum = postgresql.ENUM(
        "draft", "sending", "sent", "failed", name="campaign_status", create_type=False
    )

    postgresql.ENUM("sent", "opened", "clicked", "bounced", "failed", name="event_type").create(
        bind, checkfirst=True
    )
    event_type_enum = postgresql.ENUM(
        "sent", "opened", "clicked", "bounced", "failed", name="event_type", create_type=False
    )

    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("segment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("segments.id"), nullable=True),
        sa.Column("channel", campaign_channel_enum, nullable=False, server_default="email"),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", campaign_status_enum, nullable=False, server_default="draft"),
        sa.Column("subject", sa.String(length=200), nullable=True),
        sa.Column("html_body", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_campaigns_organization_id", "campaigns", ["organization_id"])

    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("type", event_type_enum, nullable=False),
        sa.Column("extra", postgresql.JSONB(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_events_organization_id", "events", ["organization_id"])
    op.create_index("ix_events_campaign_id", "events", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_events_campaign_id", table_name="events")
    op.drop_index("ix_events_organization_id", table_name="events")
    op.drop_table("events")
    op.drop_index("ix_campaigns_organization_id", table_name="campaigns")
    op.drop_table("campaigns")
    postgresql.ENUM(name="event_type").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="campaign_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="campaign_channel").drop(op.get_bind(), checkfirst=True)
