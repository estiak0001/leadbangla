import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.enums import TenantRole
from app.services import location_service as svc

router = APIRouter(prefix="/locations", tags=["locations"])


class LocationBody(BaseModel):
    kind: str = Field(pattern="^(division|district|area)$")
    name: str = Field(min_length=1, max_length=100)
    name_bn: str | None = Field(default=None, max_length=100)
    parent_id: uuid.UUID | None = None          # the division of a district, the district of an area
    latitude: float | None = None
    longitude: float | None = None


def _manager(m) -> None:
    if m.role not in (TenantRole.OWNER, TenantRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners and admins can change the locations list")


def _fail(e: svc.LocationError):
    raise HTTPException(status_code=e.status, detail=str(e))


def _row(loc, parents: dict, used: dict) -> dict:
    p = parents.get(loc.parent_id)
    return {"id": loc.id, "kind": loc.kind, "name": loc.name, "name_bn": loc.name_bn, "parent_id": loc.parent_id,
            "parent_name": p.name if p else None, "division": loc.name if loc.kind == "division" else loc.division,
            "latitude": loc.latitude, "longitude": loc.longitude, "contacts": used.get((loc.kind, loc.name.lower()), 0)}


async def _payload(db, org_id) -> dict:
    rows = await svc.list_locations(db, org_id)
    parents = {r.id: r for r in rows}
    used = await svc.usage_counts(db, org_id)
    return {"items": [_row(r, parents, used) for r in rows]}


@router.get("")
async def list_locations(m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await _payload(db, m.organization_id)


@router.post("", status_code=201)
async def create(body: LocationBody, m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _manager(m)
    try:
        loc = await svc.create_location(db, m.organization_id, kind=body.kind, name=body.name, name_bn=body.name_bn,
                                        parent_id=body.parent_id, latitude=body.latitude, longitude=body.longitude)
    except svc.LocationError as e:
        _fail(e)
    return _row(loc, {}, {})


@router.post("/restore-defaults")
async def restore(m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _manager(m)
    return {"added": await svc.restore_defaults(db, m.organization_id)}


@router.post("/import-areas")
async def import_areas(file: UploadFile = File(...), m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _manager(m)
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File is too large (max 5 MB).")
    try:
        return await svc.import_areas(db, m.organization_id, raw)
    except svc.LocationError as e:
        _fail(e)


@router.put("/{loc_id}")
async def update(loc_id: uuid.UUID, body: LocationBody, m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _manager(m)
    try:
        loc = await svc.update_location(db, m.organization_id, loc_id, name=body.name, name_bn=body.name_bn,
                                        parent_id=body.parent_id, latitude=body.latitude, longitude=body.longitude)
    except svc.LocationError as e:
        _fail(e)
    return _row(loc, {}, {})


@router.delete("/{loc_id}")
async def delete(loc_id: uuid.UUID, m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _manager(m)
    try:
        return {"contacts_still_using": await svc.delete_location(db, m.organization_id, loc_id)}
    except svc.LocationError as e:
        _fail(e)
