import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.billing import Plan, Subscription
from app.models.enums import SubscriptionStatus


class PlanNotFoundError(Exception):
    pass


class SubscriptionNotFoundError(Exception):
    pass


async def list_active_plans(db: AsyncSession) -> list[Plan]:
    result = await db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.price_bdt))
    return list(result)


async def get_plan(db: AsyncSession, plan_id: uuid.UUID) -> Plan:
    plan = await db.get(Plan, plan_id)
    if plan is None or not plan.is_active:
        raise PlanNotFoundError(plan_id)
    return plan


async def create_pending_subscription(db: AsyncSession, user_id: uuid.UUID, plan: Plan) -> Subscription:
    subscription = Subscription(
        user_id=user_id,
        plan_id=plan.id,
        status=SubscriptionStatus.PENDING,
        tran_id=uuid.uuid4().hex,
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    return subscription


async def get_subscription_by_tran_id(db: AsyncSession, tran_id: str) -> Subscription | None:
    return await db.scalar(
        select(Subscription).options(selectinload(Subscription.plan)).where(Subscription.tran_id == tran_id)
    )


async def mark_subscription_active(db: AsyncSession, tran_id: str, val_id: str) -> Subscription:
    subscription = await get_subscription_by_tran_id(db, tran_id)
    if subscription is None:
        raise SubscriptionNotFoundError(tran_id)
    subscription.status = SubscriptionStatus.ACTIVE
    subscription.gateway_val_id = val_id
    await db.commit()
    await db.refresh(subscription)
    return subscription


async def get_latest_subscription_for_user(db: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    result = await db.scalars(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.created_at.desc())
    )
    return result.first()


async def user_has_active_subscription(db: AsyncSession, user_id: uuid.UUID) -> bool:
    subscription = await get_latest_subscription_for_user(db, user_id)
    return subscription is not None and subscription.status == SubscriptionStatus.ACTIVE


async def cancel_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription:
    subscription = await get_latest_subscription_for_user(db, user_id)
    if subscription is None or subscription.status != SubscriptionStatus.ACTIVE:
        raise SubscriptionNotFoundError(user_id)
    subscription.status = SubscriptionStatus.CANCELLED
    await db.commit()
    await db.refresh(subscription)
    return subscription
