import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.integrations.email_delivery import EmailSendError
from app.integrations.email_client import email_client
from app.services.email_provider_service import EmailNotConfiguredError
from app.models.contact import Contact
from app.models.enums import TenantRole
from app.models.notification_settings import OrgNotificationSettings
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.models.wallet import OrgWallet
from app.models.workflow import Workflow
from app.services.plan_service import get_org_plan

USAGE_CHECKS = [
    ("contacts", "contacts_limit", Contact),
    ("workflows", "workflows_limit", Workflow),
]


async def get_or_create_settings(db: AsyncSession, org_id: uuid.UUID) -> OrgNotificationSettings:
    settings = await db.scalar(
        select(OrgNotificationSettings).where(OrgNotificationSettings.organization_id == org_id)
    )
    if settings is None:
        settings = OrgNotificationSettings(organization_id=org_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def update_settings(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    low_balance_alert: bool | None = None,
    usage_limit_alert: bool | None = None,
    low_balance_threshold_bdt: float | None = None,
) -> OrgNotificationSettings:
    settings = await get_or_create_settings(db, org_id)
    if low_balance_alert is not None:
        settings.low_balance_alert = low_balance_alert
    if usage_limit_alert is not None:
        settings.usage_limit_alert = usage_limit_alert
    if low_balance_threshold_bdt is not None:
        settings.low_balance_threshold_bdt = low_balance_threshold_bdt
    await db.commit()
    await db.refresh(settings)
    return settings


async def _get_owner_user(db: AsyncSession, org_id: uuid.UUID) -> User | None:
    member = await db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id, OrganizationMember.role == TenantRole.OWNER
        )
    )
    if member is None:
        return None
    return await db.get(User, member.user_id)


logger = logging.getLogger(__name__)


async def _try_send(db: AsyncSession, *, org_id: uuid.UUID | None = None, **kwargs) -> bool:
    """Alert emails are best-effort: log why one couldn't go out instead of failing the whole daily job."""
    try:
        await email_client.send_system_email(db, **kwargs)
        return True
    except (EmailNotConfiguredError, EmailSendError) as e:
        logger.warning("Alert email not sent: %s", e)
        return False


async def check_org_alerts(db: AsyncSession, org_id: uuid.UUID) -> dict:
    """Runs the low-balance and usage-limit checks for one org, emailing the
    owner as needed. Returns a summary so callers (the daily task, or a
    manual admin trigger) can report what actually happened."""
    result: dict = {"low_balance_sent": False, "usage_alerts_sent": []}

    user = await _get_owner_user(db, org_id)
    if user is None:
        return result

    settings = await get_or_create_settings(db, org_id)

    if settings.low_balance_alert:
        wallet = await db.scalar(select(OrgWallet).where(OrgWallet.organization_id == org_id))
        threshold_paisa = int(settings.low_balance_threshold_bdt * 100)
        if wallet and wallet.balance_paisa < threshold_paisa:
            balance_bdt = wallet.balance_paisa / 100
            threshold_bdt = float(settings.low_balance_threshold_bdt)
            from app.services import inbox  # noqa: PLC0415

            await inbox.notify(db, org_id, await inbox.recipients_with_permission(db, org_id, "billing"), category="billing",
                               kind="low_balance", title=f"Wallet balance is low: ৳{balance_bdt:,.2f}",
                               body=f"Below your alert level of ৳{threshold_bdt:,.2f}. Top up to keep campaigns running.", link="/billing?tab=wallet")
            result["low_balance_sent"] = await _try_send(
                db,
                org_id=org_id,
                to_email=user.email,
                subject="Your LeadBangla credit balance is low",
                html_body=f"""
                <p>Your credit wallet balance is <strong>{balance_bdt:.2f} BDT</strong>,
                which is below your alert threshold of {threshold_bdt:.2f} BDT.</p>
                <p>Top up now to keep SMS and email campaigns running uninterrupted.</p>
                <p><a href="{app_settings.app_base_url}/billing?tab=wallet">Top Up Now &rarr;</a></p>
                """,
            )

    if settings.usage_limit_alert:
        plan = await get_org_plan(db, org_id)
        if plan is not None:
            for resource, limit_field, model in USAGE_CHECKS:
                limit = getattr(plan, limit_field)
                if limit == -1:
                    continue
                count = await db.scalar(select(func.count(model.id)).where(model.organization_id == org_id)) or 0
                if count >= int(limit * 0.9):
                    from app.services import inbox  # noqa: PLC0415

                    await inbox.notify(db, org_id, await inbox.recipients_with_permission(db, org_id, "billing"), category="billing",
                                       kind="usage_limit", title=f"You're close to your {resource} limit",
                                       body=f"{count:,} of {limit:,} used on the {plan.name} plan.", link="/billing?tab=plan")
                    sent = await _try_send(
                        db,
                        org_id=org_id,
                        to_email=user.email,
                        subject=f"You're close to your {resource} limit on LeadBangla",
                        html_body=f"""
                        <p>You've used {count:,} of {limit:,} {resource} on your current plan ({plan.name}).</p>
                        <p><a href="{app_settings.app_base_url}/billing?tab=plan">Upgrade your plan &rarr;</a></p>
                        """,
                    )
                    if sent:
                        result["usage_alerts_sent"].append(resource)

    return result


async def run_all_org_alerts(db: AsyncSession) -> dict:
    orgs = list(await db.scalars(select(Organization)))
    summary = {"orgs_checked": 0, "low_balance_emails": 0, "usage_emails": 0}
    for org in orgs:
        r = await check_org_alerts(db, org.id)
        summary["orgs_checked"] += 1
        if r["low_balance_sent"]:
            summary["low_balance_emails"] += 1
        summary["usage_emails"] += len(r["usage_alerts_sent"])
    return summary
