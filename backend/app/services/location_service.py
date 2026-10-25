"""Per-company master list of places: Division > District > Area, each with an optional map point.
Seeded once from Bangladesh (8 divisions, 64 districts, major city areas), then fully editable."""
from __future__ import annotations

import csv
import io
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.bd_locations import AREAS, DISTRICTS, DIVISION_ROWS
from app.models.contact import Contact
from app.models.crm import Location

KINDS = ("division", "district", "area")
PARENT_KIND = {"division": None, "district": "division", "area": "district"}


class LocationError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _geo(lat, lng):
    from app.services.geo import check_pair  # noqa: PLC0415

    try:
        return check_pair(lat, lng)
    except ValueError as e:
        raise LocationError(str(e))


async def _all(db: AsyncSession, org_id: uuid.UUID) -> list[Location]:
    return list(await db.scalars(select(Location).where(Location.organization_id == org_id)))


async def _add_missing_defaults(db: AsyncSession, org_id: uuid.UUID) -> int:
    rows = await _all(db, org_id)
    divs = {r.name.lower(): r for r in rows if r.kind == "division"}
    dists = {r.name.lower(): r for r in rows if r.kind == "district"}
    areas = {(r.parent_id, r.name.lower()) for r in rows if r.kind == "area"}
    added = 0
    for name, bn, lat, lng in DIVISION_ROWS:
        if name.lower() not in divs:
            divs[name.lower()] = Location(id=uuid.uuid4(), organization_id=org_id, name=name, name_bn=bn, kind="division", latitude=lat, longitude=lng)
            db.add(divs[name.lower()])
            added += 1
    for en, bn, div, lat, lng in DISTRICTS:
        if en.lower() not in dists:
            dists[en.lower()] = Location(id=uuid.uuid4(), organization_id=org_id, name=en, name_bn=bn, kind="district", division=div,
                                         parent_id=divs[div.lower()].id, latitude=lat, longitude=lng)
            db.add(dists[en.lower()])
            added += 1
    for dist, area, bn, lat, lng in AREAS:
        d = dists.get(dist.lower())
        if d is not None and (d.id, area.lower()) not in areas:
            db.add(Location(organization_id=org_id, name=area, name_bn=bn, kind="area", division=d.division, parent_id=d.id, latitude=lat, longitude=lng))
            areas.add((d.id, area.lower()))
            added += 1
    await db.flush()
    return added


async def ensure_seeded(db: AsyncSession, org_id: uuid.UUID) -> None:
    """First use: copy the defaults into the company's list. The marker means a list the owner later
    empties is not silently refilled."""
    from app.services.crm_service import ensure_initialized  # noqa: PLC0415

    settings = await ensure_initialized(db, org_id)
    if settings.locations_seeded:
        return
    await _add_missing_defaults(db, org_id)
    settings.locations_seeded = True
    try:
        await db.commit()
    except Exception:  # concurrent first use
        await db.rollback()


async def list_locations(db: AsyncSession, org_id: uuid.UUID) -> list[Location]:
    await ensure_seeded(db, org_id)
    rank = {"division": 0, "district": 1, "area": 2}
    rows = await _all(db, org_id)
    return sorted(rows, key=lambda r: (rank[r.kind], r.division or "", r.name))


def _clean_name(name: str) -> str:
    name = " ".join((name or "").split())
    if not name:
        raise LocationError("Give the place a name")
    return name[:100]


async def _parent_for(db: AsyncSession, org_id: uuid.UUID, kind: str, parent_id: uuid.UUID | None) -> Location | None:
    need = PARENT_KIND[kind]
    if need is None:
        return None
    if parent_id is None:
        raise LocationError(f"Choose the {need} this {kind} belongs to")
    parent = await db.get(Location, parent_id)
    if not parent or parent.organization_id != org_id or parent.kind != need:
        raise LocationError(f"{'An' if kind == 'area' else 'A'} {kind} must belong to a {need}")
    return parent


async def _dup(db: AsyncSession, org_id: uuid.UUID, kind: str, parent_id, name: str, exclude: uuid.UUID | None = None) -> bool:
    q = select(Location.id).where(Location.organization_id == org_id, Location.kind == kind, func.lower(Location.name) == name.lower(),
                                  Location.parent_id.is_(None) if parent_id is None else Location.parent_id == parent_id)
    if exclude:
        q = q.where(Location.id != exclude)
    return await db.scalar(q) is not None


async def create_location(db: AsyncSession, org_id: uuid.UUID, *, kind: str, name: str, name_bn: str | None, parent_id: uuid.UUID | None,
                          latitude: float | None, longitude: float | None) -> Location:
    await ensure_seeded(db, org_id)
    if kind not in KINDS:
        raise LocationError("Type must be division, district or area")
    name = _clean_name(name)
    parent = await _parent_for(db, org_id, kind, parent_id)
    if await _dup(db, org_id, kind, parent.id if parent else None, name):
        raise LocationError(f"“{name}” is already in your list" + (f" under {parent.name}" if parent else ""), 409)
    lat, lng = _geo(latitude, longitude)
    division = name if kind == "division" else (parent.name if kind == "district" else parent.division)  # type: ignore[union-attr]
    loc = Location(organization_id=org_id, name=name, name_bn=(name_bn or "").strip()[:100] or None, kind=kind,
                   parent_id=parent.id if parent else None, division=division if kind != "division" else None, latitude=lat, longitude=lng)
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return loc


_CONTACT_COL = {"division": Contact.division, "district": Contact.district, "area": Contact.area}


async def update_location(db: AsyncSession, org_id: uuid.UUID, loc_id: uuid.UUID, *, name: str, name_bn: str | None, parent_id: uuid.UUID | None,
                          latitude: float | None, longitude: float | None) -> Location:
    loc = await db.get(Location, loc_id)
    if not loc or loc.organization_id != org_id:
        raise LocationError("Place not found", 404)
    name = _clean_name(name)
    parent = await _parent_for(db, org_id, loc.kind, parent_id)
    new_parent_id = parent.id if parent else None
    if await _dup(db, org_id, loc.kind, new_parent_id, name, exclude=loc_id):
        raise LocationError(f"“{name}” is already in your list" + (f" under {parent.name}" if parent else ""), 409)
    lat, lng = _geo(latitude, longitude)
    old = loc.name
    old_parent = loc.parent_id
    loc.name, loc.name_bn, loc.latitude, loc.longitude = name, (name_bn or "").strip()[:100] or None, lat, lng
    loc.parent_id = new_parent_id
    col = _CONTACT_COL[loc.kind]
    if old != name:      # keep contacts pointing at the renamed place
        vals = {loc.kind: name, **({"city": name} if loc.kind == "district" else {})}
        scope = [Contact.organization_id == org_id, func.lower(col) == old.lower()]
        if loc.kind == "area":
            scope.append(func.lower(Contact.district) == func.lower(parent.name))  # type: ignore[union-attr]
        await db.execute(update(Contact).where(*scope).values(**vals))
    if loc.kind == "division":
        await db.execute(update(Location).where(Location.organization_id == org_id, Location.division == old).values(division=name))
    elif loc.kind == "district" and old_parent != new_parent_id:   # moved to another division
        loc.division = parent.name  # type: ignore[union-attr]
        await db.execute(update(Location).where(Location.parent_id == loc.id).values(division=parent.name))  # type: ignore[union-attr]
        await db.execute(update(Contact).where(Contact.organization_id == org_id, func.lower(Contact.district) == name.lower()).values(division=parent.name))  # type: ignore[union-attr]
    await db.commit()
    await db.refresh(loc)
    return loc


async def delete_location(db: AsyncSession, org_id: uuid.UUID, loc_id: uuid.UUID) -> int:
    """Returns how many contacts still have this place written on them (their text is left as it is)."""
    loc = await db.get(Location, loc_id)
    if not loc or loc.organization_id != org_id:
        raise LocationError("Place not found", 404)
    kids = await db.scalar(select(func.count(Location.id)).where(Location.parent_id == loc_id)) or 0
    if kids:
        child = {"division": "districts", "district": "areas"}[loc.kind]
        raise LocationError(f"“{loc.name}” still has {kids} {child}. Delete or move them first.", 409)
    col = _CONTACT_COL[loc.kind]
    used = await db.scalar(select(func.count(Contact.id)).where(
        Contact.organization_id == org_id, Contact.deleted_at.is_(None), func.lower(col) == loc.name.lower())) or 0
    await db.delete(loc)
    await db.commit()
    return used


async def usage_counts(db: AsyncSession, org_id: uuid.UUID) -> dict[tuple[str, str], int]:
    out: dict[tuple[str, str], int] = {}
    for kind, col in _CONTACT_COL.items():
        rows = await db.execute(select(func.lower(col), func.count(Contact.id)).where(
            Contact.organization_id == org_id, Contact.deleted_at.is_(None), col.isnot(None)).group_by(func.lower(col)))
        for name, n in rows:
            out[(kind, name)] = n
    return out


async def restore_defaults(db: AsyncSession, org_id: uuid.UUID) -> int:
    """Add back any default division / district / major area that is missing. Nothing existing is changed."""
    await ensure_seeded(db, org_id)
    added = await _add_missing_defaults(db, org_id)
    await db.commit()
    return added


async def import_areas(db: AsyncSession, org_id: uuid.UUID, raw: bytes) -> dict:
    """CSV of areas (upazilas, thanas, localities): district, area, area_bn, latitude, longitude."""
    await ensure_seeded(db, org_id)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise LocationError("The file is empty.")
    norm = {" ".join((h or "").lower().replace("_", " ").split()): h for h in reader.fieldnames}

    def col(*names):
        return next((norm[n] for n in names if n in norm), None)
    c_dist, c_area, c_bn = col("district", "জেলা"), col("area", "upazila", "thana", "locality", "name"), col("area bn", "name bn", "bangla", "বাংলা")
    c_lat, c_lng = col("latitude", "lat"), col("longitude", "lng", "lon", "long")
    if not c_dist or not c_area:
        raise LocationError("The file needs a “district” column and an “area” column. Found: " + ", ".join(reader.fieldnames))
    rows = await _all(db, org_id)
    dists = {r.name.lower(): r for r in rows if r.kind == "district"}
    dists.update({r.name_bn: r for r in rows if r.kind == "district" and r.name_bn})
    have = {(r.parent_id, r.name.lower()) for r in rows if r.kind == "area"}
    created = skipped = 0
    errors: list[dict] = []
    for n, row in enumerate(reader, start=2):
        dn, an = (row.get(c_dist) or "").strip(), " ".join((row.get(c_area) or "").split())
        if not dn and not an:
            continue
        d = dists.get(dn.lower()) or dists.get(dn)
        if d is None:
            errors.append({"row": n, "reason": "district is not in your list", "value": dn[:60]}); skipped += 1; continue
        if not an:
            errors.append({"row": n, "reason": "area is empty", "value": ""}); skipped += 1; continue
        if (d.id, an.lower()) in have:
            skipped += 1; continue
        try:
            lat, lng = _geo((row.get(c_lat) or "").strip() or None if c_lat else None, (row.get(c_lng) or "").strip() or None if c_lng else None)
        except LocationError as e:
            errors.append({"row": n, "reason": str(e), "value": an[:60]}); lat = lng = None
        db.add(Location(organization_id=org_id, name=an[:100], name_bn=((row.get(c_bn) or "").strip()[:100] or None) if c_bn else None,
                        kind="area", division=d.division, parent_id=d.id, latitude=lat, longitude=lng))
        have.add((d.id, an.lower()))
        created += 1
    await db.commit()
    return {"created": created, "skipped": skipped, "errors": errors[:50]}


async def resolve_place(db: AsyncSession, org_id: uuid.UUID, *, division: str | None = None, district: str | None = None,
                        area: str | None = None, city: str | None = None) -> dict:
    """Match typed text (English or Bangla, any case) to the company's list. Returns canonical division / district / area
    (+ `city`, kept equal to the district) and `warnings` for things not in the list (those are kept as typed)."""
    def clean(v):
        v = " ".join((v or "").split())
        return v or None
    division, district, area, city = clean(division), clean(district), clean(area), clean(city)
    district = district or city
    rows = await list_locations(db, org_id)
    by_kind = {k: [r for r in rows if r.kind == k] for k in KINDS}

    def find(kind: str, text: str | None, parent: Location | None = None):
        if not text:
            return None
        low = text.lower()
        for r in by_kind[kind]:
            if (r.name.lower() == low or (r.name_bn and r.name_bn == text)) and (parent is None or r.parent_id == parent.id):
                return r
        return None

    warnings: list[str] = []
    d = find("district", district)
    dv = find("division", division)
    if district and d is None:
        warnings.append(f"District “{district}” is not in your Locations list")
    if d is not None:
        district = d.name
        parent = next((r for r in by_kind["division"] if r.id == d.parent_id), None)
        if parent is not None:
            if dv is not None and dv.id != parent.id:
                warnings.append(f"{d.name} is in {parent.name} division, not {dv.name} — used {parent.name}")
            dv = parent
    division = dv.name if dv is not None else division
    if division and dv is None:
        warnings.append(f"Division “{division}” is not in your Locations list")
    if area:
        a = find("area", area, d) if d is not None else None
        if a is not None:
            area = a.name
        else:
            warnings.append(f"Area “{area}” is not in your Locations list" + (f" under {district}" if d is not None else ""))
    return {"division": division, "district": district, "area": area, "city": district, "warnings": warnings}
