"""Platform staff manage a company end to end: edit its profile, manage its
people, suspend it, keep private notes."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.admin import _to_detail
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.core.security import create_invite_token, hash_password
from app.integrations.email_client import email_client
from app.models.enums import OrgLanguage, TenantRole
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.schemas.admin import TenantDetail
from app.schemas.organization_profile import OrganizationProfileUpdate

router = APIRouter(prefix="/admin/tenants", tags=["admin"])

OPTIONAL_TEXT = ("display_name", "phone", "website", "contact_email", "address", "city", "country", "trade_license_no", "tin")


async def _org(db: AsyncSession, org_id: uuid.UUID) -> Organization:
    org = await db.scalar(
        select(Organization).options(selectinload(Organization.members).selectinload(OrganizationMember.user)).where(Organization.id == org_id)
        .execution_options(populate_existing=True)  # a stale members list would hide what we just changed
    )
    if org is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return org


class ProfileUpdate(OrganizationProfileUpdate):
    internal_notes: str | None = Field(default=None, max_length=4000)


@router.patch("/{org_id}", response_model=TenantDetail)
async def update_tenant(org_id: uuid.UUID, payload: ProfileUpdate, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> TenantDetail:
    """Edit any company detail on the customer's behalf."""
    org = await _org(db, org_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("name"):
        org.name = data["name"].strip()
    if data.get("language"):
        org.language = OrgLanguage(data["language"])
    for key in ("industry", "company_size"):
        if data.get(key):
            setattr(org, key, data[key])
    for key in OPTIONAL_TEXT:
        if key in data:
            setattr(org, key, (data[key] or "").strip() or None)
    if "internal_notes" in data:
        org.internal_notes = (data["internal_notes"] or "").strip() or None
    await db.commit()
    return await _to_detail(db, await _org(db, org_id))


class SuspendBody(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


@router.post("/{org_id}/suspend", response_model=TenantDetail)
async def suspend(org_id: uuid.UUID, body: SuspendBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> TenantDetail:
    org = await _org(db, org_id)
    org.is_suspended, org.suspended_reason = True, (body.reason or "").strip() or None
    await db.commit()
    return await _to_detail(db, await _org(db, org_id))


@router.post("/{org_id}/unsuspend", response_model=TenantDetail)
async def unsuspend(org_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> TenantDetail:
    org = await _org(db, org_id)
    org.is_suspended, org.suspended_reason = False, None
    await db.commit()
    return await _to_detail(db, await _org(db, org_id))


# ── People ───────────────────────────────────────────────────────────────────

class MemberAdd(BaseModel):
    email: EmailStr
    role: TenantRole = TenantRole.MEMBER
    send_invite: bool = True


class RoleBody(BaseModel):
    role: TenantRole


async def _send_invite(db: AsyncSession, org: Organization, user: User) -> None:
    token = create_invite_token(str(user.id))
    try:
        await email_client.send_email(
            db, org_id=org.id, to_email=user.email,
            subject=f"You've been added to {org.name} on LeadBangla",
            html_body=f'<p>You now have access to <strong>{org.name}</strong> on LeadBangla.</p>'
                      f'<p><a href="{settings.app_base_url}/accept-invite?token={token}">Set your password &rarr;</a></p>',
        )
    except Exception:  # noqa: BLE001 — email trouble must not block the admin action
        pass


@router.post("/{org_id}/members", response_model=TenantDetail, status_code=201)
async def add_member(org_id: uuid.UUID, body: MemberAdd, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> TenantDetail:
    org = await _org(db, org_id)
    user = await db.scalar(select(User).where(User.email == body.email))
    is_new = user is None
    if user is not None:
        taken = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == user.id))
        if taken is not None:
            raise HTTPException(status_code=409, detail="This person already belongs to a company. A person can only be in one.")
    else:
        user = User(email=body.email, hashed_password=hash_password(uuid.uuid4().hex))
        db.add(user)
        await db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=body.role))
    await db.commit()
    if body.send_invite and is_new:
        await _send_invite(db, org, user)
    return await _to_detail(db, await _org(db, org_id))


async def _member(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> OrganizationMember:
    m = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id))
    if m is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return m


async def _owner_count(db: AsyncSession, org_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org_id, OrganizationMember.role == TenantRole.OWNER)) or 0


@router.patch("/{org_id}/members/{user_id}", response_model=TenantDetail)
async def change_role(org_id: uuid.UUID, user_id: uuid.UUID, body: RoleBody, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> TenantDetail:
    m = await _member(db, org_id, user_id)
    if m.role == TenantRole.OWNER and body.role != TenantRole.OWNER and await _owner_count(db, org_id) <= 1:
        raise HTTPException(status_code=409, detail="A company needs at least one owner. Make someone else an owner first.")
    m.role = body.role
    await db.commit()
    return await _to_detail(db, await _org(db, org_id))


@router.delete("/{org_id}/members/{user_id}", response_model=TenantDetail)
async def remove_member(org_id: uuid.UUID, user_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> TenantDetail:
    m = await _member(db, org_id, user_id)
    if m.role == TenantRole.OWNER and await _owner_count(db, org_id) <= 1:
        raise HTTPException(status_code=409, detail="You can't remove the only owner. Make someone else an owner first.")
    await db.delete(m)
    await db.commit()
    return await _to_detail(db, await _org(db, org_id))


@router.post("/{org_id}/members/{user_id}/resend-invite")
async def resend_invite(org_id: uuid.UUID, user_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    org = await _org(db, org_id)
    await _member(db, org_id, user_id)
    user = await db.get(User, user_id)
    await _send_invite(db, org, user)
    return {"ok": True}
