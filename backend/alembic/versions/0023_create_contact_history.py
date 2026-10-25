"""create contact history table

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "changed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("changes", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "source_history_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contact_history.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_contact_history_organization_id", "contact_history", ["organization_id"])
    op.create_index("ix_contact_history_contact_id", "contact_history", ["contact_id"])


def downgrade() -> None:
    op.drop_index("ix_contact_history_contact_id", table_name="contact_history")
    op.drop_index("ix_contact_history_organization_id", table_name="contact_history")
    op.drop_table("contact_history")
