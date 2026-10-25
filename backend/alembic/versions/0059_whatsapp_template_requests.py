"""WhatsApp template requests (customer asks, platform approves, Meta reviews)

Revision ID: 0059
Revises: 0058
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_template_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("label", sa.String(100), nullable=False),            # the customer's own name for it
        sa.Column("meta_name", sa.String(512), nullable=False, unique=True),  # the unique name sent to Meta
        sa.Column("language", sa.String(16), nullable=False, server_default="en"),
        sa.Column("category", sa.String(20), nullable=False, server_default="utility"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("examples", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        # pending (platform review) | rejected | with_meta | approved | meta_rejected | cancelled
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("meta_template_id", sa.String(64), nullable=True),
        sa.Column("meta_reason", sa.String(500), nullable=True),
        sa.Column("reviewed_by", sa.String(255), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("whatsapp_template_requests")
