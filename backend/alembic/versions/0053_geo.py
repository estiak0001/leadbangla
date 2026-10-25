"""Geo coordinates for contacts and the locations master list

Revision ID: 0053
Revises: 0052
"""
import sqlalchemy as sa
from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for t in ("contacts", "locations"):
        op.add_column(t, sa.Column("latitude", sa.Float(), nullable=True))
        op.add_column(t, sa.Column("longitude", sa.Float(), nullable=True))
    # Fill the approximate district centres into lists that were seeded before coordinates existed.
    from app.data.bd_locations import DISTRICTS  # noqa: PLC0415

    conn = op.get_bind()
    for en, _bn, _div, lat, lng in DISTRICTS:
        conn.execute(sa.text("UPDATE locations SET latitude=:la, longitude=:lo WHERE lower(name)=lower(:n) AND latitude IS NULL AND kind='district'"),
                     {"la": lat, "lo": lng, "n": en})


def downgrade() -> None:
    for t in ("locations", "contacts"):
        op.drop_column(t, "longitude")
        op.drop_column(t, "latitude")
