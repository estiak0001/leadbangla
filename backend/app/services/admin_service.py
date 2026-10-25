import uuid
from datetime import datetime, timezone

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import create_invite_token, hash_password
from app.integrations.email_client import email_client
from app.models.billing import Plan, Subscription
from app.models.enums import OrgLanguage, SubscriptionStatus, TenantRole
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.models.wallet import OrgWallet, WalletTransaction
from app.schemas.admin import AdminTenantCreateRequest
from app.services.billing_service import get_plan
from app.services.onboarding_service import get_membership_for_user


class TenantNotFoundError(Exception):
    pass


class ImpersonationTargetError(Exception):
    pass


class TenantOwnerAlreadyAssignedError(Exception):
    pass


async def list_organizations(db: AsyncSession) -> list[Organization]:
    result = await db.scalars(
        select(Organization)
        .options(selectinload(Organization.members).selectinload(OrganizationMember.user))
        .order_by(Organization.created_at.desc())
    )
    return list(result)


async def get_organization(db: AsyncSession, org_id: uuid.UUID) -> Organization:
    org = await db.scalar(
        select(Organization)
        .options(selectinload(Organization.members).selectinload(OrganizationMember.user))
        .where(Organization.id == org_id)
    )
    if org is None:
        raise TenantNotFoundError(org_id)
    return org


async def get_latest_subscription_for_org(db: AsyncSession, org_id: uuid.UUID) -> Subscription | None:
    return await db.scalar(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(Subscription.organization_id == org_id)
        .order_by(Subscription.created_at.desc())
    )


def get_owner_email(org: Organization) -> str | None:
    for member in org.members:
        if member.role == TenantRole.OWNER:
            return member.user.email
    return None


async def get_member_for_impersonation(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganizationMember:
    member = await db.scalar(
        select(OrganizationMember)
        .options(selectinload(OrganizationMember.user))
        .where(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)
    )
    if member is None:
        raise ImpersonationTargetError(user_id)
    return member


async def list_org_wallets(db: AsyncSession) -> list[tuple[OrgWallet, str]]:
    """Returns (wallet, org_name) pairs for every org that has a wallet, ordered
    lowest balance first. Orgs that have never sent anything billable / topped
    up have no OrgWallet row yet, so they're simply absent from this list."""
    rows = await db.execute(
        select(OrgWallet, Organization.name)
        .join(Organization, OrgWallet.organization_id == Organization.id)
        .order_by(OrgWallet.balance_paisa)
    )
    return list(rows.all())


async def list_recent_wallet_transactions(db: AsyncSession, limit: int = 50) -> list[tuple[WalletTransaction, str]]:
    """Most recent wallet transactions across all orgs, newest first, with org name attached."""
    rows = await db.execute(
        select(WalletTransaction, Organization.name)
        .join(Organization, WalletTransaction.organization_id == Organization.id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(limit)
    )
    return list(rows.all())


async def get_revenue_summary(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)

    plan_rows = await db.execute(
        select(Plan.price_bdt, func.count(Subscription.id))
        .join(Subscription, Subscription.plan_id == Plan.id)
        .where(Subscription.status == SubscriptionStatus.ACTIVE)
        .group_by(Plan.price_bdt)
    )
    mrr_bdt = sum(price * count for price, count in plan_rows.all())

    topup_revenue_paisa = await db.scalar(
        select(func.sum(WalletTransaction.amount_paisa)).where(
            WalletTransaction.type == "topup",
            extract("year", WalletTransaction.created_at) == now.year,
            extract("month", WalletTransaction.created_at) == now.month,
        )
    ) or 0

    total_float_paisa = await db.scalar(select(func.sum(OrgWallet.balance_paisa))) or 0

    active_subs = await db.scalar(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
    ) or 0

    service_rows = await db.execute(
        select(WalletTransaction.service, func.sum(func.abs(WalletTransaction.amount_paisa)))
        .where(
            WalletTransaction.type == "deduction",
            extract("year", WalletTransaction.created_at) == now.year,
            extract("month", WalletTransaction.created_at) == now.month,
            WalletTransaction.service.is_not(None),
        )
        .group_by(WalletTransaction.service)
    )
    service_spend_bdt = {service: paisa / 100 for service, paisa in service_rows.all()}

    return {
        "mrr_bdt": mrr_bdt,
        "credit_topup_revenue_bdt": round(topup_revenue_paisa / 100, 2),
        "total_float_bdt": round(total_float_paisa / 100, 2),
        "active_subscriptions": active_subs,
        "credit_consumption_bdt": service_spend_bdt,
    }


async def admin_create_tenant(db: AsyncSession, payload: AdminTenantCreateRequest) -> Organization:
    """Staff-initiated onboarding — creates a tenant directly instead of the
    self-service signup -> subscribe -> complete-onboarding flow, for deals
    closed outside the marketing site (phone/sales calls)."""
    owner = await db.scalar(select(User).where(User.email == payload.owner_email))
    is_new_user = owner is None

    if owner is not None:
        if await get_membership_for_user(db, owner.id) is not None:
            raise TenantOwnerAlreadyAssignedError(payload.owner_email)
    else:
        owner = User(email=payload.owner_email, hashed_password=hash_password(uuid.uuid4().hex))
        db.add(owner)
        await db.flush()

    organization = Organization(
        name=payload.org_name,
        language=OrgLanguage(payload.language),
        phone=payload.phone,
        industry=payload.industry,
        company_size=payload.company_size,
        website=payload.website,
        display_name=payload.display_name or None,
        contact_email=payload.contact_email or None,
        address=payload.address or None,
        city=payload.city or None,
        country=payload.country or None,
        trade_license_no=payload.trade_license_no or None,
        tin=payload.tin or None,
        internal_notes=payload.internal_notes or None,
    )
    db.add(organization)
    await db.flush()

    db.add(OrganizationMember(organization_id=organization.id, user_id=owner.id, role=TenantRole.OWNER))

    if payload.plan_id is not None:
        plan = await get_plan(db, payload.plan_id)  # raises PlanNotFoundError, propagated to the route
        db.add(
            Subscription(
                user_id=owner.id,
                organization_id=organization.id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                tran_id=f"admin-{uuid.uuid4().hex}",
                source="admin",
                admin_note="Set at onboarding",
            )
        )

    await db.commit()

    if payload.starting_credit_bdt > 0:
        from app.services.wallet_service import admin_adjust  # noqa: PLC0415

        await admin_adjust(db, organization.id, int(round(payload.starting_credit_bdt * 100)), "Starting credit at onboarding", "staff")
        await db.commit()

    if not payload.send_invite:
        return await get_organization(db, organization.id)

    if is_new_user:
        invite_token = create_invite_token(str(owner.id))
        await email_client.send_email(
            db,
            org_id=organization.id,
            to_email=owner.email,
            subject=f"You've been added to LeadBangla — set up {payload.org_name}",
            html_body=f"""
            <p>An account has been created for you as the owner of
            <strong>{payload.org_name}</strong> on LeadBangla.</p>
            <p><a href="{settings.app_base_url}/accept-invite?token={invite_token}">
            Set your password &rarr;</a></p>
            """,
        )
    else:
        await email_client.send_email(
            db,
            org_id=organization.id,
            to_email=owner.email,
            subject=f"{payload.org_name} is ready on LeadBangla",
            html_body=f"""
            <p>Your organization <strong>{payload.org_name}</strong> has been set up.</p>
            <p><a href="{settings.app_base_url}/login">Log in &rarr;</a></p>
            """,
        )

    return await get_organization(db, organization.id)
