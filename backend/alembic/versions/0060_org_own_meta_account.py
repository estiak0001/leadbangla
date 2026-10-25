"""A customer's own Meta WhatsApp account (token, phone number id, WABA) and its webhook key

Revision ID: 0060
Revises: 0059
"""
import sqlalchemy as sa
from alembic import op

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("whatsapp_meta_enc", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("whatsapp_webhook_key", sa.String(40), nullable=True))
    op.create_index("ix_organizations_whatsapp_webhook_key", "organizations", ["whatsapp_webhook_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_organizations_whatsapp_webhook_key", "organizations")
    op.drop_column("organizations", "whatsapp_webhook_key")
    op.drop_column("organizations", "whatsapp_meta_enc")
