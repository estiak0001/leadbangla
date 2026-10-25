"""create landing_pages and form_submissions tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-30

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "landing_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(120), nullable=False, unique=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("blocks", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_landing_pages_organization_id", "landing_pages", ["organization_id"])
    op.create_index("ix_landing_pages_slug", "landing_pages", ["slug"], unique=True)

    op.create_table(
        "form_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "landing_page_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("landing_pages.id"),
            nullable=False,
        ),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_form_submissions_organization_id", "form_submissions", ["organization_id"])
    op.create_index("ix_form_submissions_landing_page_id", "form_submissions", ["landing_page_id"])


def downgrade() -> None:
    op.drop_index("ix_form_submissions_landing_page_id", table_name="form_submissions")
    op.drop_index("ix_form_submissions_organization_id", table_name="form_submissions")
    op.drop_table("form_submissions")
    op.drop_index("ix_landing_pages_slug", table_name="landing_pages")
    op.drop_index("ix_landing_pages_organization_id", table_name="landing_pages")
    op.drop_table("landing_pages")
