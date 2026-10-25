import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.billing import Subscription
from app.models.enums import OrgLanguage, SubscriptionStatus, TenantRole
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.services.audience_service import seed_default_tag_presets


class AlreadyOnboardedError(Exception):
    pass


class SubscriptionRequiredError(Exception):
    pass


class MissingRegistrationDataError(Exception):
    """Raised for accounts created before registration fields moved to
    signup — there's nothing to build an Organization from."""

    pass


async def get_membership_for_user(db: AsyncSession, user_id: uuid.UUID) -> OrganizationMember | None:
    return await db.scalar(
        select(OrganizationMember)
        .options(selectinload(OrganizationMember.organization))
        .where(OrganizationMember.user_id == user_id)
    )


async def complete_onboarding(db: AsyncSession, user_id: uuid.UUID) -> Organization:
    existing = await get_membership_for_user(db, user_id)
    if existing is not None:
        raise AlreadyOnboardedError(user_id)

    subscription = await db.scalar(
        select(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status == SubscriptionStatus.ACTIVE)
        .order_by(Subscription.created_at.desc())
    )
    if subscription is None:
        raise SubscriptionRequiredError(user_id)

    user = await db.get(User, user_id)
    if user is None or not user.pending_org_name:
        raise MissingRegistrationDataError(user_id)

    organization = Organization(
        name=user.pending_org_name,
        language=OrgLanguage(user.pending_language or "en"),
        phone=user.pending_phone,
        industry=user.pending_industry,
        company_size=user.pending_company_size,
        website=user.pending_website,
    )
    db.add(organization)
    await db.flush()

    db.add(OrganizationMember(organization_id=organization.id, user_id=user_id, role=TenantRole.OWNER))
    subscription.organization_id = organization.id
    await seed_default_tag_presets(db, organization.id)

    await db.commit()
    await db.refresh(organization)
    return organization
