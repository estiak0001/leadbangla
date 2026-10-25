import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import PlanLimitError
from app.models.billing import CreditRate, Plan, Subscription
from app.models.enums import SubscriptionStatus


class PlanNotFoundError(Exception):
    pass


class CreditRateNotFoundError(Exception):
    pass


class PlanCodeTakenError(Exception):
    pass


class PlanInUseError(Exception):
    """Plan still has subscriptions, so it can only be deactivated, not deleted."""


async def get_org_plan(db: AsyncSession, org_id: uuid.UUID) -> Plan | None:
    """Returns the active Plan for an org, or None if no active subscription."""
    subscription = await db.scalar(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(
            Subscription.organization_id == org_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
        )
        .order_by(Subscription.created_at.desc())
    )
    return subscription.plan if subscription else None


async def get_plan_limit(db: AsyncSession, org_id: uuid.UUID, field: str) -> int:
    """Returns the named limit column for an org's active plan. -1 = unlimited, 0 if no plan."""
    plan = await get_org_plan(db, org_id)
    if plan is None:
        return 0
    return getattr(plan, field, 0)


async def has_plan_feature(db: AsyncSession, org_id: uuid.UUID, field: str) -> bool:
    """Returns the named boolean feature column for an org's active plan (e.g.
    `custom_domain`), False if there's no active plan."""
    plan = await get_org_plan(db, org_id)
    if plan is None:
        return False
    return bool(getattr(plan, field, False))


async def ensure_within_limit(db: AsyncSession, org_id: uuid.UUID, field: str, resource: str, current: int) -> None:
    """Raise PlanLimitError (-> HTTP 402) if creating one more `resource` would
    exceed the org's plan limit. `current` is how many the org already has.
    -1 = unlimited; no active plan = 0 allowed."""
    limit = await get_plan_limit(db, org_id, field)
    if limit != -1 and current >= limit:
        raise PlanLimitError(resource, current, limit)


async def require_plan_feature(db: AsyncSession, org_id: uuid.UUID, field: str, resource: str) -> None:
    """Raise PlanLimitError (-> HTTP 402) if the org's plan lacks a boolean feature."""
    if not await has_plan_feature(db, org_id, field):
        raise PlanLimitError(resource, 0, 0)


async def get_credit_rate(db: AsyncSession, service: str) -> CreditRate | None:
    return await db.scalar(
        select(CreditRate).where(CreditRate.service == service, CreditRate.is_active.is_(True))
    )


async def list_all_plans(db: AsyncSession) -> list[Plan]:
    result = await db.scalars(select(Plan).order_by(Plan.price_bdt))
    return list(result)


async def list_credit_rates(db: AsyncSession) -> list[CreditRate]:
    result = await db.scalars(select(CreditRate).order_by(CreditRate.service))
    return list(result)


async def update_plan(db: AsyncSession, plan_id: uuid.UUID, data: dict) -> Plan:
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise PlanNotFoundError(plan_id)
    for key, value in data.items():
        setattr(plan, key, value)
    await db.commit()
    await db.refresh(plan)
    return plan


async def create_plan(db: AsyncSession, data: dict) -> Plan:
    if await db.scalar(select(Plan).where(Plan.code == data["code"])):
        raise PlanCodeTakenError(data["code"])
    plan = Plan(**data)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def delete_plan(db: AsyncSession, plan_id: uuid.UUID) -> None:
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise PlanNotFoundError(plan_id)
    in_use = await db.scalar(select(func.count(Subscription.id)).where(Subscription.plan_id == plan_id))
    if in_use:
        raise PlanInUseError(plan_id)
    await db.delete(plan)
    await db.commit()


async def update_credit_rate(db: AsyncSession, rate_id: uuid.UUID, rate_bdt: Decimal, admin_email: str) -> CreditRate:
    rate = await db.get(CreditRate, rate_id)
    if rate is None:
        raise CreditRateNotFoundError(rate_id)
    rate.rate_bdt = rate_bdt
    rate.updated_by = admin_email
    await db.commit()
    await db.refresh(rate)
    return rate


async def count_org_tenants_per_plan(db: AsyncSession) -> dict[uuid.UUID, int]:
    """Returns {plan_id: active_subscription_count} for all plans."""
    rows = await db.execute(
        select(Subscription.plan_id, func.count(Subscription.id))
        .where(Subscription.status == SubscriptionStatus.ACTIVE)
        .group_by(Subscription.plan_id)
    )
    return dict(rows.all())
