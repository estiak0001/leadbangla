"""A nullable renewal_invoice_id on subscriptions, so the SSLCommerz online-payment
round trip (subscribe -> redirect -> webhook, with only tran_id persisted across it)
can carry which due invoice a renewal payment is for through to activation.

Revision ID: 0075
Revises: 0074
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("renewal_invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("subscriptions", "renewal_invoice_id")
