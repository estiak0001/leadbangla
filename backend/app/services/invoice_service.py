"""Billing-period math, invoice issuance, renewal reminders, and (behind a feature
flag, default off) auto-expiry of unpaid subscriptions."""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.integrations.email_client import email_client
from app.integrations.email_delivery import EmailSendError
from app.models.billing import Invoice, InvoiceCounter, Plan, Subscription
from app.models.enums import InvoiceStatus, SubscriptionStatus, TenantRole
from app.models.organization import OrganizationMember
from app.models.user import User
from app.services import inbox
from app.services.email_provider_service import EmailNotConfiguredError

logger = logging.getLogger(__name__)

RENEWAL_REMINDER_DAYS = 7
GRACE_DAYS = 5


def _add_months(dt: datetime, months: int) -> datetime:
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                        31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return dt.replace(year=year, month=month, day=day)


def period_end_for(plan: Plan, start: datetime) -> datetime:
    return _add_months(start, 12 if plan.billing_interval == "yearly" else 1)


async def next_invoice_number(db: AsyncSession) -> str:
    """Locks the single counter row so two concurrent invoice creations can never
    collide on a number -- mirrors the wallet balance lock in wallet_service.py.
    Must be called inside the same transaction as the Invoice insert it numbers."""
    counter = await db.scalar(select(InvoiceCounter).with_for_update())
    if counter is None:
        counter = InvoiceCounter(id=uuid.uuid4(), last_number=0)
        db.add(counter)
        await db.flush()
    counter.last_number += 1
    return f"INV-{datetime.now(timezone.utc).year}-{counter.last_number:06d}"


async def _owner_email(db: AsyncSession, org_id: uuid.UUID) -> str | None:
    member = await db.scalar(
        select(OrganizationMember).where(OrganizationMember.organization_id == org_id, OrganizationMember.role == TenantRole.OWNER)
    )
    if member is None:
        return None
    user = await db.get(User, member.user_id)
    return user.email if user else None


async def _try_send(db: AsyncSession, *, org_id: uuid.UUID | None = None, **kwargs) -> bool:
    """Reminder/expiry emails are best-effort: log why one couldn't go out instead
    of failing the whole renewal run. `org_id` is accepted (unused here) only to
    match the call-site shape used elsewhere for this kind of alert email."""
    try:
        await email_client.send_system_email(db, **kwargs)
        return True
    except (EmailNotConfiguredError, EmailSendError) as e:
        logger.warning("Invoice email not sent: %s", e)
        return False


async def issue_invoice_for_activation(
    db: AsyncSession, subscription: Subscription, *, payment_method: str, payment_reference: str | None
) -> Invoice | None:
    """Records a paid invoice for the period a subscription just started. Every
    activation path (free/online/manual/admin) calls this after setting
    current_period_start/end, so invoice history is complete from day one."""
    if subscription.organization_id is None:
        return None  # no org to attribute it to yet (pre-onboarding); nothing to show in an Invoices tab anyway
    plan = subscription.plan or await db.get(Plan, subscription.plan_id)
    invoice = Invoice(
        organization_id=subscription.organization_id,
        subscription_id=subscription.id,
        plan_id=subscription.plan_id,
        invoice_number=await next_invoice_number(db),
        amount_bdt=plan.price_bdt if plan else 0,
        status=InvoiceStatus.PAID,
        period_start=subscription.current_period_start,
        period_end=subscription.current_period_end,
        paid_at=datetime.now(timezone.utc),
        payment_method=payment_method,
        payment_reference=payment_reference,
    )
    db.add(invoice)
    await db.flush()
    return invoice


async def issue_renewal_invoice_if_due(db: AsyncSession, subscription: Subscription) -> Invoice | None:
    """For an ACTIVE subscription whose period ends within RENEWAL_REMINDER_DAYS,
    issues a 'due' invoice for the *next* period and notifies the org -- unless one
    already exists (enforced by the DB unique constraint, not just a pre-check, so
    this is safe under Celery retries/concurrent runs)."""
    if subscription.organization_id is None or subscription.current_period_end is None:
        return None
    plan = subscription.plan or await db.get(Plan, subscription.plan_id)
    if plan is None or plan.price_bdt == 0:
        return None  # free plans don't renew
    now = datetime.now(timezone.utc)
    if subscription.current_period_end - now > timedelta(days=RENEWAL_REMINDER_DAYS):
        return None

    next_start = subscription.current_period_end
    next_end = period_end_for(plan, next_start)
    invoice = Invoice(
        organization_id=subscription.organization_id, subscription_id=subscription.id, plan_id=subscription.plan_id,
        invoice_number=await next_invoice_number(db), amount_bdt=plan.price_bdt, status=InvoiceStatus.DUE,
        period_start=next_start, period_end=next_end, due_at=next_start,
    )
    try:
        async with db.begin_nested():
            db.add(invoice)
            await db.flush()
    except IntegrityError:
        return None  # another run already issued this period's invoice -- no-op, not an error
    await db.commit()

    await inbox.notify(
        db, subscription.organization_id, await inbox.recipients_with_permission(db, subscription.organization_id, "billing"),
        category="billing", kind="invoice_due",
        title=f"Your {plan.name} plan renews soon — ৳{invoice.amount_bdt:,}",
        body=f"Due {next_start.strftime('%d %b %Y')}. Pay to keep using {plan.name} without interruption.",
        link="/billing?tab=invoices",
    )
    owner_email = await _owner_email(db, subscription.organization_id)
    if owner_email:
        await _try_send(
            db, org_id=subscription.organization_id, to_email=owner_email,
            subject=f"Your LeadBangla {plan.name} plan renews on {next_start.strftime('%d %b %Y')}",
            html_body=f"""
            <p>Your <strong>{plan.name}</strong> plan ({invoice.amount_bdt:,} BDT) is due for renewal on
            <strong>{next_start.strftime('%d %B %Y')}</strong>.</p>
            <p>You keep full access while this is unpaid for a short grace period, but pay before then to
            avoid any interruption.</p>
            <p><a href="{app_settings.app_base_url}/billing?tab=invoices">Pay now &rarr;</a></p>
            """,
        )
    await db.commit()
    return invoice


async def expire_overdue_subscriptions(db: AsyncSession) -> int:
    """Flips ACTIVE subscriptions to EXPIRED once they're GRACE_DAYS past their
    period end with no paid invoice for that period. Only ever called by the daily
    task when the 'auto_expire_subscriptions' feature flag is on (default off)."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=GRACE_DAYS)
    candidates = list(await db.scalars(
        select(Subscription).where(Subscription.status == SubscriptionStatus.ACTIVE, Subscription.current_period_end < cutoff)
    ))
    expired = 0
    for sub in candidates:
        due_invoice = await db.scalar(
            select(Invoice).where(Invoice.subscription_id == sub.id, Invoice.period_start == sub.current_period_end).with_for_update()
        )
        if due_invoice is not None and due_invoice.status == InvoiceStatus.PAID:
            continue  # paid between the query above and now -- don't expire a subscription that just renewed
        sub.status = SubscriptionStatus.EXPIRED
        expired += 1
        if sub.organization_id:
            await inbox.notify(
                db, sub.organization_id, await inbox.recipients_with_permission(db, sub.organization_id, "billing"),
                category="billing", kind="subscription_expired", title="Your plan has expired",
                body="Renew to get your plan features back.", link="/billing?tab=invoices",
            )
        await db.commit()
    return expired
