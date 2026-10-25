"""WhatsApp monthly plan limit and health-check state

Revision ID: 0062
Revises: 0061
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -1 = unlimited, 0 = none. Sensible starting caps; editable per plan in the admin panel.
    op.add_column("plans", sa.Column("whatsapp_monthly_limit", sa.Integer(), nullable=False, server_default="0"))
    op.execute("UPDATE plans SET whatsapp_monthly_limit = 2000 WHERE code = 'growth'")
    op.execute("UPDATE plans SET whatsapp_monthly_limit = 10000 WHERE code = 'pro'")
    op.create_table(
        "whatsapp_health",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # NULL organization_id = the platform's own Meta connection
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, unique=True),
        sa.Column("ok", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("quality", sa.String(20), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("alert_key", sa.String(120), nullable=True),
        sa.Column("alerted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # one platform row only (the unique index above ignores NULLs)
    op.create_index("uq_whatsapp_health_platform", "whatsapp_health", [sa.text("(organization_id IS NULL)")], unique=True, postgresql_where=sa.text("organization_id IS NULL"))


def downgrade() -> None:
    op.drop_index("uq_whatsapp_health_platform", table_name="whatsapp_health")
    op.drop_table("whatsapp_health")
    op.drop_column("plans", "whatsapp_monthly_limit")
