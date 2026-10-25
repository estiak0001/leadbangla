"""create sms_inbound_messages table for two-way SMS replies

Revision ID: 0032
Revises: 0031
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sms_inbound_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=True,
        ),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("from_phone", sa.String(length=32), nullable=False),
        sa.Column("to_sender_id", sa.String(length=20), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_sms_inbound_messages_organization_id", "sms_inbound_messages", ["organization_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_sms_inbound_messages_organization_id", table_name="sms_inbound_messages")
    op.drop_table("sms_inbound_messages")
