"""create social accounts and posts tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-30

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    postgresql.ENUM("facebook", "instagram", "linkedin", name="social_platform").create(
        bind, checkfirst=True
    )
    social_platform_enum = postgresql.ENUM(
        "facebook", "instagram", "linkedin", name="social_platform", create_type=False
    )

    postgresql.ENUM(
        "draft", "scheduled", "publishing", "published", "failed", name="social_post_status"
    ).create(bind, checkfirst=True)
    social_post_status_enum = postgresql.ENUM(
        "draft", "scheduled", "publishing", "published", "failed",
        name="social_post_status", create_type=False,
    )

    op.create_table(
        "social_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("platform", social_platform_enum, nullable=False),
        sa.Column("account_name", sa.String(200), nullable=False),
        sa.Column("page_id", sa.String(200), nullable=False, server_default=""),
        sa.Column("access_token", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_social_accounts_organization_id", "social_accounts", ["organization_id"])

    op.create_table(
        "social_posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "social_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("social_accounts.id"),
            nullable=False,
        ),
        sa.Column("platform", social_platform_enum, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("media_url", sa.String(500), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("external_post_id", sa.String(200), nullable=True),
        sa.Column("status", social_post_status_enum, nullable=False, server_default="draft"),
        sa.Column("likes_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("shares_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("comments_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_social_posts_organization_id", "social_posts", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_social_posts_organization_id", table_name="social_posts")
    op.drop_table("social_posts")
    op.drop_index("ix_social_accounts_organization_id", table_name="social_accounts")
    op.drop_table("social_accounts")
    postgresql.ENUM(name="social_post_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="social_platform").drop(op.get_bind(), checkfirst=True)
