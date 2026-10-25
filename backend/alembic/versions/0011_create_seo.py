"""create SEO audit tables

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-01

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    status_enum = postgresql.ENUM(
        "pending", "running", "completed", "failed",
        name="seoauditstatus", create_type=False,
    )
    status_enum.create(bind=bind, checkfirst=True)

    op.create_table(
        "seo_audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("status", status_enum, nullable=False, server_default="pending"),
        sa.Column("pages_crawled", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_seo_audits_organization_id", "seo_audits", ["organization_id"])

    op.create_table(
        "seo_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "audit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("seo_audits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(500), nullable=False, server_default="''"),
        sa.Column("title_length", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("meta_description", sa.Text(), nullable=False, server_default="''"),
        sa.Column("meta_description_length", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("h1_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("h1_text", sa.String(500), nullable=False, server_default="''"),
        sa.Column("canonical_url", sa.String(2000), nullable=False, server_default="''"),
        sa.Column("has_noindex", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("img_without_alt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("internal_links_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("broken_links", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("issues", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("crawled_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_seo_pages_audit_id", "seo_pages", ["audit_id"])
    op.create_index("ix_seo_pages_organization_id", "seo_pages", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_seo_pages_organization_id", table_name="seo_pages")
    op.drop_index("ix_seo_pages_audit_id", table_name="seo_pages")
    op.drop_table("seo_pages")
    op.drop_index("ix_seo_audits_organization_id", table_name="seo_audits")
    op.drop_table("seo_audits")
    op.execute("DROP TYPE IF EXISTS seoauditstatus")
