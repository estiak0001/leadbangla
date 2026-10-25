"""Platform staff manage a tenant's plan: upgrade/downgrade/cancel without a payment."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.models.billing import Plan, Subscription
from app.models.contact import Contact
from app.models.enums import SubscriptionStatus, TenantRole
from app.models.landing_page import LandingPage
from app.models.enums import SmsChannel
from app.models.organization import Organization, OrganizationMember
from app.models.social import SocialAccount
from app.models.user import User
from app.models.workflow import Workflow
from app.services import sms_plan
from app.services.campaign_service import count_emails_this_month
from app.services.plan_service import get_org_plan

router = APIRouter(prefix="/admin/tenants", tags=["admin"])


class PlanChange(BaseModel):
    plan_id: uuid.UUID
    note: str | None = Field(default=None, max_length=500)


class CancelBody(BaseModel):
    note: str | None = Field(default=None, max_length=500)


async def _org(db: AsyncSession, org_id: uuid.UUID) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return org


def _plan_dict(p: Plan | None) -> dict | None:
    if p is None:
        return None
    return {k: getattr(p, k) for k in (
        "id", "code", "name", "price_bdt", "billing_interval", "contacts_limit", "emails_monthly_limit", "team_members_limit",
        "workflows_limit", "landing_pages_limit", "social_accounts_limit", "seo_credits_monthly", "custom_domain",
        "priority_support", "sms_enabled", "sms_monthly_limit", "masking_allowed", "whatsapp_enabled", "whatsapp_monthly_limit")}


async def _usage(db: AsyncSession, org_id: uuid.UUID) -> dict:
    def count(model):
        return db.scalar(select(func.count(model.id)).where(model.organization_id == org_id))
    return {
        "contacts": await count(Contact) or 0, "workflows": await count(Workflow) or 0, "landing_pages": await count(LandingPage) or 0,
        "team_members": await count(OrganizationMember) or 0, "social_accounts": await count(SocialAccount) or 0,
        "emails_monthly": await count_emails_this_month(db, org_id), "sms_monthly": await sms_plan.used_this_month(db, org_id),
        "whatsapp_monthly": await sms_plan.used_this_month(db, org_id, SmsChannel.WHATSAPP),
    }


async def _snapshot(db: AsyncSession, org: Organization) -> dict:
    plan = await get_org_plan(db, org.id)
    active = await db.scalar(select(Subscription).where(Subscription.organization_id == org.id, Subscription.status == SubscriptionStatus.ACTIVE).order_by(Subscription.created_at.desc()))
    rows = list((await db.execute(
        select(Subscription, Plan.name, Plan.price_bdt).join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.organization_id == org.id).order_by(Subscription.created_at.desc()).limit(30))).all())
    return {
        "plan": _plan_dict(plan),
        "since": active.created_at if active else None,
        "source": active.source if active else None,
        "note": active.admin_note if active else None,
        "usage": await _usage(db, org.id),
        "history": [{"id": str(s.id), "plan_name": name, "price_bdt": price, "status": s.status.value, "source": s.source,
                     "note": s.admin_note, "changed_by": s.changed_by, "created_at": s.created_at} for s, name, price in rows],
    }


@router.get("/{org_id}/subscription")
async def get_subscription(org_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await _snapshot(db, await _org(db, org_id))


async def _owner_id(db: AsyncSession, org_id: uuid.UUID) -> uuid.UUID:
    uid = await db.scalar(select(OrganizationMember.user_id).where(OrganizationMember.organization_id == org_id, OrganizationMember.role == TenantRole.OWNER))
    if uid is None:
        raise HTTPException(status_code=400, detail="This tenant has no owner to attach a subscription to")
    return uid


async def _end_active(db: AsyncSession, org_id: uuid.UUID) -> None:
    for sub in await db.scalars(select(Subscription).where(Subscription.organization_id == org_id, Subscription.status == SubscriptionStatus.ACTIVE)):
        sub.status = SubscriptionStatus.CANCELLED


@router.post("/{org_id}/plan")
async def change_plan(org_id: uuid.UUID, body: PlanChange, admin: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Moves the tenant onto a plan immediately; no payment is taken. The previous plan stays in the history."""
    org = await _org(db, org_id)
    plan = await db.get(Plan, body.plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    current = await get_org_plan(db, org_id)
    if current and current.id == plan.id:
        raise HTTPException(status_code=409, detail=f"This tenant is already on {plan.name}.")
    owner = await _owner_id(db, org_id)
    await _end_active(db, org_id)
    db.add(Subscription(user_id=owner, organization_id=org_id, plan_id=plan.id, status=SubscriptionStatus.ACTIVE, tran_id=f"admin-{uuid.uuid4().hex}",
                        source="admin", admin_note=(body.note or None), changed_by=admin.email))
    await db.commit()
    return await _snapshot(db, org)


@router.post("/{org_id}/subscription/cancel")
async def cancel_subscription(org_id: uuid.UUID, body: CancelBody, admin: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Ends the tenant's plan: they keep their data but lose plan features until a plan is set again."""
    org = await _org(db, org_id)
    if await get_org_plan(db, org_id) is None:
        raise HTTPException(status_code=409, detail="This tenant has no active plan.")
    owner = await _owner_id(db, org_id)
    last = await db.scalar(select(Subscription).where(Subscription.organization_id == org_id, Subscription.status == SubscriptionStatus.ACTIVE).order_by(Subscription.created_at.desc()))
    await _end_active(db, org_id)
    if last:  # record who cancelled and why on the subscription that ended
        last.admin_note, last.changed_by = (body.note or "Cancelled by staff"), admin.email
    await db.commit()
    return await _snapshot(db, org)
