"""create influencer and deliverable tables

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "influencers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("handle", sa.String(200), nullable=True),
        sa.Column("platform", sa.String(50), nullable=False, server_default="instagram"),
        sa.Column("followers", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("niche", sa.String(100), nullable=True),
        sa.Column("engagement_rate", sa.Float(), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("outreach_status", sa.String(30), nullable=False, server_default="new"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_influencers_org", "influencers", ["organization_id"])

    op.create_table(
        "deliverables",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "influencer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("influencers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(50), nullable=False, server_default="post"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column(
            "referral_link_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("referral_links.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_deliverables_org", "deliverables", ["organization_id"])
    op.create_index("ix_deliverables_influencer", "deliverables", ["influencer_id"])


def downgrade() -> None:
    op.drop_index("ix_deliverables_influencer", "deliverables")
    op.drop_index("ix_deliverables_org", "deliverables")
    op.drop_table("deliverables")
    op.drop_index("ix_influencers_org", "influencers")
    op.drop_table("influencers")
