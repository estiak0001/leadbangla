"""Push: per-customer site key (public subscribe) and where each subscriber came from

Revision ID: 0061
Revises: 0060
"""
import sqlalchemy as sa
from alembic import op

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("push_configs", sa.Column("site_key", sa.String(40), nullable=True))
    op.create_index("ix_push_configs_site_key", "push_configs", ["site_key"], unique=True)
    op.add_column("push_tokens", sa.Column("source", sa.String(20), nullable=False, server_default="dashboard"))
    op.add_column("push_tokens", sa.Column("email", sa.String(320), nullable=True))


def downgrade() -> None:
    op.drop_column("push_tokens", "email")
    op.drop_column("push_tokens", "source")
    op.drop_index("ix_push_configs_site_key", "push_configs")
    op.drop_column("push_configs", "site_key")
