import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership, get_current_user
from app.core.permissions import CATALOG, ROLE_DEFAULTS, require_permission
from app.models.enums import TenantRole
from app.models.user import User
from app.services import team_service as svc

# Everything here needs the "team" permission (owners/admins always have it).
router = APIRouter(prefix="/team", tags=["team"], dependencies=[Depends(require_permission("team"))])


class MemberInvite(BaseModel):
    email: EmailStr
    role: TenantRole = TenantRole.MEMBER
    permissions: list[str] | None = None
    job_title: str | None = Field(default=None, max_length=100)
    password_mode: str = Field(default="invite", pattern="^(invite|set)$")   # email a link, or create the password now
    password: str | None = Field(default=None, max_length=128)            # blank with mode=set -> generated


class PasswordReset(BaseModel):
    mode: str = Field(pattern="^(link|set)$")
    password: str | None = Field(default=None, max_length=128)


class MemberPatch(BaseModel):
    role: TenantRole | None = None
    permissions: list[str] | None = None
    is_active: bool | None = None
    job_title: str | None = Field(default=None, max_length=100)


def _fail(e: svc.TeamError):
    raise HTTPException(status_code=e.status, detail=str(e))


@router.get("/permissions")
async def permissions_catalog():
    return {
        "catalog": [{"key": k, "label": v[0], "description": v[1]} for k, v in CATALOG.items()],
        "role_defaults": {r.value: p for r, p in ROLE_DEFAULTS.items()},
    }


@router.get("/members")
async def members(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await svc.list_members(db, membership.organization_id)


@router.post("/members", status_code=201)
async def invite(body: MemberInvite, membership=Depends(get_current_membership), user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    try:
        return await svc.add_member(db, membership, user, email=body.email, role=body.role,
                                    permissions=body.permissions, job_title=body.job_title,
                                    password_mode=body.password_mode, password=body.password)
    except svc.TeamError as e:
        _fail(e)


@router.patch("/members/{user_id}", status_code=204)
async def patch_member(user_id: uuid.UUID, body: MemberPatch, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    fields = body.model_fields_set
    try:
        await svc.update_member(
            db, membership, user_id, role=body.role, permissions=body.permissions, permissions_set="permissions" in fields,
            is_active=body.is_active, job_title=body.job_title, job_title_set="job_title" in fields)
    except svc.TeamError as e:
        _fail(e)


@router.delete("/members/{user_id}")
async def delete_member(user_id: uuid.UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.remove_member(db, membership, user_id)
    except svc.TeamError as e:
        _fail(e)


@router.post("/members/{user_id}/resend-invite")
async def resend(user_id: uuid.UUID, membership=Depends(get_current_membership), user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    try:
        return await svc.resend_invite(db, membership, user, user_id)
    except svc.TeamError as e:
        _fail(e)


@router.get("/activity")
async def activity(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await svc.list_audit(db, membership.organization_id)


class PresetBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    permissions: list[str]


@router.get("/presets")
async def presets(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await svc.list_presets(db, membership.organization_id)


@router.post("/presets", status_code=201)
async def save_preset(body: PresetBody, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.save_preset(db, membership, body.name, body.permissions)
    except svc.TeamError as e:
        _fail(e)


@router.delete("/presets/{preset_id}", status_code=204)
async def remove_preset(preset_id: uuid.UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    if not await svc.delete_preset(db, membership, preset_id):
        raise HTTPException(status_code=404, detail="Preset not found")


@router.post("/members/{user_id}/reset-password")
async def reset_password(user_id: uuid.UUID, body: PasswordReset, membership=Depends(get_current_membership),
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.reset_password(db, membership, user, user_id, mode=body.mode, password=body.password)
    except svc.TeamError as e:
        _fail(e)
