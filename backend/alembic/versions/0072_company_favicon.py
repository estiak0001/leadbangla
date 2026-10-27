"""Favicon upload on company settings, alongside the logo

Revision ID: 0072
Revises: 0071
"""
import sqlalchemy as sa
from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("platform_company_settings", sa.Column("favicon_data", sa.LargeBinary(), nullable=True))
    op.add_column("platform_company_settings", sa.Column("favicon_content_type", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("platform_company_settings", "favicon_content_type")
    op.drop_column("platform_company_settings", "favicon_data")
