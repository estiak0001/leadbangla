"""create organizations and organization_members tables, link subscriptions

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-24

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    postgresql.ENUM("bn", "en", name="org_language").create(bind, checkfirst=True)
    org_language_enum = postgresql.ENUM("bn", "en", name="org_language", create_type=False)

    postgresql.ENUM("owner", "admin", "member", name="tenant_role").create(bind, checkfirst=True)
    tenant_role_enum = postgresql.ENUM("owner", "admin", "member", name="tenant_role", create_type=False)

    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("language", org_language_enum, nullable=False, server_default="en"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "organization_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", tenant_role_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_member_org_user"),
    )

    op.add_column(
        "subscriptions",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "organization_id")
    op.drop_table("organization_members")
    op.drop_table("organizations")
    postgresql.ENUM(name="tenant_role").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="org_language").drop(op.get_bind(), checkfirst=True)
