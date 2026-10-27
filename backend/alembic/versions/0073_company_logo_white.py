"""White/light logo variant on company settings, for dark backgrounds

Revision ID: 0073
Revises: 0072
"""
import sqlalchemy as sa
from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("platform_company_settings", sa.Column("logo_white_data", sa.LargeBinary(), nullable=True))
    op.add_column("platform_company_settings", sa.Column("logo_white_content_type", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("platform_company_settings", "logo_white_content_type")
    op.drop_column("platform_company_settings", "logo_white_data")
