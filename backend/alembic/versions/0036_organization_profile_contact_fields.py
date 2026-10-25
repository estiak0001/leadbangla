"""organization contact and business details

Revision ID: 0036
Revises: 0035
Create Date: 2026-10-18

"""
import sqlalchemy as sa
from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None

COLUMNS = [
    ("display_name", sa.String(200)),      # optional branch / trading name shown next to the company name
    ("contact_email", sa.String(255)),
    ("address", sa.String(300)),
    ("city", sa.String(100)),
    ("country", sa.String(100)),
    ("trade_license_no", sa.String(60)),
    ("tin", sa.String(30)),
]


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("organizations", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("organizations", name)
