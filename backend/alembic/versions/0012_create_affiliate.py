"""create affiliate referral tables

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "referral_programs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("commission_type", sa.String(20), nullable=False, server_default="percentage"),
        sa.Column("commission_value", sa.Float(), nullable=False, server_default="10.0"),
        sa.Column("cookie_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("target_url", sa.String(2000), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_referral_programs_org", "referral_programs", ["organization_id"])

    op.create_table(
        "referral_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "program_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("referral_programs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("conversions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_referral_links_org", "referral_links", ["organization_id"])
    op.create_index("ix_referral_links_program", "referral_links", ["program_id"])
    op.create_index("ix_referral_links_code", "referral_links", ["code"])

    op.create_table(
        "referral_clicks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "link_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("referral_links.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("referer", sa.String(2000), nullable=True),
        sa.Column("converted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_referral_clicks_link", "referral_clicks", ["link_id"])

    op.create_table(
        "commissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "program_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("referral_programs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "link_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("referral_links.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "click_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("referral_clicks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("commission_amount", sa.Float(), nullable=False),
        sa.Column("conversion_value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_commissions_org", "commissions", ["organization_id"])


def downgrade() -> None:
    op.drop_table("commissions")
    op.drop_index("ix_referral_clicks_link", "referral_clicks")
    op.drop_table("referral_clicks")
    op.drop_index("ix_referral_links_code", "referral_links")
    op.drop_index("ix_referral_links_program", "referral_links")
    op.drop_index("ix_referral_links_org", "referral_links")
    op.drop_table("referral_links")
    op.drop_index("ix_referral_programs_org", "referral_programs")
    op.drop_table("referral_programs")
