"""sending domains, sender addresses, suppressions, campaign sender

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "sending_domains",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain", sa.String(255), nullable=False, unique=True),
        sa.Column("provider", sa.String(20), nullable=False, server_default="smtp"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("dkim_selector", sa.String(63), nullable=True),
        sa.Column("dkim_private_key_enc", sa.Text(), nullable=True),
        sa.Column("dns_records", postgresql.JSONB(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sending_domains_organization_id", "sending_domains", ["organization_id"])
    op.create_table(
        "sender_addresses",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain_id", UUID, sa.ForeignKey("sending_domains.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "email", name="uq_sender_org_email"),
    )
    op.create_index("ix_sender_addresses_organization_id", "sender_addresses", ["organization_id"])
    op.create_index("ix_sender_addresses_domain_id", "sender_addresses", ["domain_id"])
    op.create_table(
        "email_suppressions",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "email", name="uq_suppression_org_email"),
    )
    op.create_index("ix_email_suppressions_organization_id", "email_suppressions", ["organization_id"])
    op.add_column(
        "campaigns",
        sa.Column("sender_id", UUID, sa.ForeignKey("sender_addresses.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("campaigns", "sender_id")
    op.drop_table("email_suppressions")
    op.drop_table("sender_addresses")
    op.drop_table("sending_domains")
