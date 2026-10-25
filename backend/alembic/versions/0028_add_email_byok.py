"""add email byok (bring your own sendgrid)

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("email_byok_allowed", sa.Boolean(), nullable=False, server_default="false"))
    op.execute("UPDATE plans SET email_byok_allowed = true WHERE code IN ('growth', 'pro')")

    op.create_table(
        "org_email_senders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("provider", sa.String(30), nullable=False, server_default="sendgrid"),
        sa.Column("api_key_enc", sa.Text(), nullable=True),
        sa.Column("from_email", sa.String(255), nullable=True),
        sa.Column("from_name", sa.String(120), nullable=True),
        sa.Column("sending_domain", sa.String(255), nullable=True),
        sa.Column("sendgrid_domain_id", sa.String(64), nullable=True),
        sa.Column("dns_records", postgresql.JSONB(), nullable=True),
        sa.Column("domain_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_ok", sa.Boolean(), nullable=True),
        sa.Column("last_test_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("org_email_senders")
    op.drop_column("plans", "email_byok_allowed")
