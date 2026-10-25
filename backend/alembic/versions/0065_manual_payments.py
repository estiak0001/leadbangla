"""Manual payments (bKash/Nagad/Rocket/bank) with proof documents

Revision ID: 0065
Revises: 0064
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
now = sa.func.now()


def upgrade() -> None:
    op.create_table(
        "manual_payments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("subscription_id", UUID, sa.ForeignKey("subscriptions.id"), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("amount_bdt", sa.Integer, nullable=False),
        sa.Column("sender_account", sa.String(100), nullable=False),
        sa.Column("trx_id", sa.String(100), nullable=False),
        sa.Column("customer_note", sa.Text),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("admin_note", sa.Text),
        sa.Column("reviewed_by", sa.String(255)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now),
    )
    op.create_index("ix_manual_payments_user_id", "manual_payments", ["user_id"])
    op.create_index("ix_manual_payments_subscription_id", "manual_payments", ["subscription_id"])
    op.create_table(
        "manual_payment_documents",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("payment_id", UUID, sa.ForeignKey("manual_payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size", sa.Integer, nullable=False),
        sa.Column("data", sa.LargeBinary, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now),
    )
    op.create_index("ix_manual_payment_documents_payment_id", "manual_payment_documents", ["payment_id"])


def downgrade() -> None:
    op.drop_table("manual_payment_documents")
    op.drop_table("manual_payments")
