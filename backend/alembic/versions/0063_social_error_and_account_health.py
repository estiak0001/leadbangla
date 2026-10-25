"""Social: why a post failed, and the last connection check of each account

Revision ID: 0063
Revises: 0062
"""
import sqlalchemy as sa
from alembic import op

revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("social_posts", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("social_accounts", sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("social_accounts", sa.Column("last_check_ok", sa.Boolean(), nullable=True))
    op.add_column("social_accounts", sa.Column("last_check_message", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("social_accounts", "last_check_message")
    op.drop_column("social_accounts", "last_check_ok")
    op.drop_column("social_accounts", "last_checked_at")
    op.drop_column("social_posts", "error_message")
