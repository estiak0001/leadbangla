"""Division > District > Area hierarchy for locations; separate division/district/area on contacts

Revision ID: 0054
Revises: 0053
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("locations", sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True, index=True))
    for c in ("division", "district", "area"):
        op.add_column("contacts", sa.Column(c, sa.String(100), nullable=True))
    op.create_index("ix_contacts_district", "contacts", ["district"])
    # Names only need to be unique within the same kind and parent (a division and its district can share a name).
    op.drop_index("uq_locations_org_name", "locations")
    op.execute("CREATE UNIQUE INDEX uq_locations_org_kind_parent_name ON locations (organization_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))")

    from app.data.bd_locations import AREAS, DISTRICTS, DIVISION_ROWS  # noqa: PLC0415

    conn = op.get_bind()
    orgs = [r[0] for r in conn.execute(sa.text("SELECT DISTINCT organization_id FROM locations"))]
    for org in orgs:
        div_ids: dict[str, uuid.UUID] = {}
        for name, bn, lat, lng in DIVISION_ROWS:
            div_ids[name] = uuid.uuid4()
            conn.execute(sa.text("INSERT INTO locations (id, organization_id, name, name_bn, division, kind, latitude, longitude) VALUES (:id,:o,:n,:bn,NULL,'division',:la,:lo)"),
                         {"id": div_ids[name], "o": org, "n": name, "bn": bn, "la": lat, "lo": lng})
        for div, did in div_ids.items():
            conn.execute(sa.text("UPDATE locations SET parent_id=:p WHERE organization_id=:o AND kind='district' AND division=:d AND parent_id IS NULL"), {"p": did, "o": org, "d": div})
        for dist, area, bn, lat, lng in AREAS:
            d = conn.execute(sa.text("SELECT id, division FROM locations WHERE organization_id=:o AND kind='district' AND lower(name)=lower(:n)"), {"o": org, "n": dist}).first()
            if d and not conn.execute(sa.text("SELECT 1 FROM locations WHERE organization_id=:o AND parent_id=:p AND lower(name)=lower(:n)"), {"o": org, "p": d[0], "n": area}).first():
                conn.execute(sa.text("INSERT INTO locations (id, organization_id, name, name_bn, division, kind, latitude, longitude, parent_id) VALUES (:id,:o,:n,:bn,:dv,'area',:la,:lo,:p)"),
                             {"id": uuid.uuid4(), "o": org, "n": area, "bn": bn, "dv": d[1], "la": lat, "lo": lng, "p": d[0]})
    # Contacts that had a district written in "city" get the separate fields filled in.
    conn.execute(sa.text("""
        UPDATE contacts c SET district = l.name, division = l.division
        FROM locations l WHERE l.organization_id = c.organization_id AND l.kind='district' AND lower(l.name) = lower(c.city)"""))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_locations_org_kind_parent_name")
    op.execute("DELETE FROM locations WHERE kind IN ('division','area')")
    op.create_index("uq_locations_org_name", "locations", ["organization_id", sa.text("lower(name)")], unique=True)
    op.drop_index("ix_contacts_district", "contacts")
    for c in ("area", "district", "division"):
        op.drop_column("contacts", c)
    op.drop_column("locations", "parent_id")
