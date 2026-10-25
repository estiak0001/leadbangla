from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership, get_current_user
from app.core.permissions import effective_permissions
from app.models.enums import OrgLanguage, TenantRole
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.schemas.organization_profile import OrganizationProfileRead, OrganizationProfileUpdate
from app.services.plan_service import get_org_plan

router = APIRouter(prefix="/organization", tags=["organization"])

OPTIONAL_TEXT = ("display_name", "phone", "website", "contact_email", "address", "city", "country", "trade_license_no", "tin")


async def _build(db: AsyncSession, membership: OrganizationMember, user: User) -> OrganizationProfileRead:
    org = await db.get(Organization, membership.organization_id)
    owner_email = await db.scalar(
        select(User.email)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .where(OrganizationMember.organization_id == org.id, OrganizationMember.role == TenantRole.OWNER)
    )
    members = await db.scalar(select(func.count()).select_from(OrganizationMember).where(OrganizationMember.organization_id == org.id)) or 0
    plan = await get_org_plan(db, org.id)
    return OrganizationProfileRead(
        id=org.id, name=org.name, display_name=org.display_name, language=org.language.value,
        phone=org.phone, website=org.website, industry=org.industry, company_size=org.company_size,
        contact_email=org.contact_email, address=org.address, city=org.city, country=org.country,
        trade_license_no=org.trade_license_no, tin=org.tin, created_at=org.created_at,
        owner_email=owner_email, my_email=user.email, my_role=membership.role.value, my_permissions=effective_permissions(membership.role, membership.permissions),
        plan_name=plan.name if plan else None, member_count=members,
        can_edit=membership.role in (TenantRole.OWNER, TenantRole.ADMIN),
    )


@router.get("/profile", response_model=OrganizationProfileRead)
async def get_profile(
    membership: OrganizationMember = Depends(get_current_membership),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationProfileRead:
    return await _build(db, membership, user)


@router.put("/profile", response_model=OrganizationProfileRead)
async def update_profile(
    payload: OrganizationProfileUpdate,
    membership: OrganizationMember = Depends(get_current_membership),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationProfileRead:
    if membership.role not in (TenantRole.OWNER, TenantRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner or an admin can edit the company profile")
    org = await db.get(Organization, membership.organization_id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"] is not None:
        org.name = data["name"].strip()
    if data.get("language"):
        org.language = OrgLanguage(data["language"])
    for key in ("industry", "company_size"):
        if key in data and data[key]:
            setattr(org, key, data[key])
    for key in OPTIONAL_TEXT:
        if key in data:
            value = (data[key] or "").strip()
            setattr(org, key, value or None)
    await db.commit()
    return await _build(db, membership, user)
