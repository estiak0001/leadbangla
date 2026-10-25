"""add organization profile fields (phone, website, industry, company_size)

Revision ID: 0026
Revises: 0025
Create Date: 2026-07-06

"""
import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("phone", sa.String(length=30), nullable=True))
    op.add_column("organizations", sa.Column("website", sa.String(length=255), nullable=True))
    op.add_column("organizations", sa.Column("industry", sa.String(length=100), nullable=True))
    op.add_column("organizations", sa.Column("company_size", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "company_size")
    op.drop_column("organizations", "industry")
    op.drop_column("organizations", "website")
    op.drop_column("organizations", "phone")
