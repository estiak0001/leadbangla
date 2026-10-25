"""add pending registration fields to users, collected at signup and
consumed by onboarding-complete once payment clears

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_org_name", sa.String(length=200), nullable=True))
    op.add_column("users", sa.Column("pending_phone", sa.String(length=30), nullable=True))
    op.add_column("users", sa.Column("pending_website", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("pending_industry", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("pending_company_size", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("pending_language", sa.String(length=2), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "pending_language")
    op.drop_column("users", "pending_company_size")
    op.drop_column("users", "pending_industry")
    op.drop_column("users", "pending_website")
    op.drop_column("users", "pending_phone")
    op.drop_column("users", "pending_org_name")
