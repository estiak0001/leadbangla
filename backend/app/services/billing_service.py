import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.billing import Invoice, Plan, Subscription
from app.models.enums import InvoiceStatus, SubscriptionStatus
from app.services import invoice_service


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


async def org_id_for_user(db: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    """The company this person belongs to, or None for a brand-new signup (onboarding links it later)."""
    from app.models.organization import OrganizationMember  # noqa: PLC0415

    return await db.scalar(select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user_id).limit(1))


async def create_pending_subscription(
    db: AsyncSession, user_id: uuid.UUID, plan: Plan, organization_id: uuid.UUID | None = None
) -> Subscription:
    subscription = Subscription(
        user_id=user_id,
        plan_id=plan.id,
        organization_id=organization_id,
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


async def _end_other_active(db: AsyncSession, org_id: uuid.UUID | None, *, keep: uuid.UUID) -> None:
    """Enforces the single-active-subscription-per-org invariant that `plan_service.
    get_org_plan` relies on. Call this before flipping any subscription to ACTIVE."""
    if org_id is None:
        return
    for sub in await db.scalars(select(Subscription).where(
        Subscription.organization_id == org_id, Subscription.status == SubscriptionStatus.ACTIVE, Subscription.id != keep
    )):
        sub.status = SubscriptionStatus.CANCELLED


async def activate_subscription(
    db: AsyncSession, subscription: Subscription, *, payment_method: str, payment_reference: str | None = None
) -> Subscription:
    """The one place a Subscription becomes ACTIVE: ends any other active
    subscription for the org, starts a fresh billing period, and issues the
    invoice for it. Every activation path (free / online / manual / admin) should
    call this instead of setting `status` directly."""
    if subscription.plan is None:
        await db.refresh(subscription, ["plan"])
    now = datetime.now(timezone.utc)
    await _end_other_active(db, subscription.organization_id, keep=subscription.id)
    subscription.current_period_start = now
    subscription.current_period_end = invoice_service.period_end_for(subscription.plan, now)
    subscription.status = SubscriptionStatus.ACTIVE
    await invoice_service.issue_invoice_for_activation(
        db, subscription, payment_method=payment_method, payment_reference=payment_reference
    )
    await db.commit()
    await db.refresh(subscription)
    return subscription


async def mark_subscription_active(db: AsyncSession, tran_id: str, val_id: str) -> Subscription:
    """Thin wrapper kept for backward compatibility -- delegates to
    `activate_subscription` for the free-tier instant-activate and SSLCommerz IPN
    paths (`billing.py`'s /subscribe and /ipn routes)."""
    subscription = await get_subscription_by_tran_id(db, tran_id)
    if subscription is None:
        raise SubscriptionNotFoundError(tran_id)
    subscription.gateway_val_id = val_id
    return await activate_subscription(
        db, subscription, payment_method="free" if val_id == "free" else "online", payment_reference=val_id
    )


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


async def void_future_invoices(db: AsyncSession, subscription_id: uuid.UUID) -> None:
    """Voids any due invoice for a period that hasn't started yet. Never touches an
    invoice for the current, already-active period -- that time was already paid
    for and used, so it stays payable/paid regardless of what happens afterward."""
    now = datetime.now(timezone.utc)
    for inv in await db.scalars(select(Invoice).where(
        Invoice.subscription_id == subscription_id, Invoice.status == InvoiceStatus.DUE, Invoice.period_start > now
    )):
        inv.status = InvoiceStatus.VOID


async def cancel_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription:
    subscription = await get_latest_subscription_for_user(db, user_id)
    if subscription is None or subscription.status != SubscriptionStatus.ACTIVE:
        raise SubscriptionNotFoundError(user_id)
    subscription.status = SubscriptionStatus.CANCELLED
    await void_future_invoices(db, subscription.id)
    await db.commit()
    await db.refresh(subscription)
    return subscription
