import asyncio
import uuid

from app.core.db import AsyncSessionLocal, engine
from app.services.campaign_service import (
    CampaignAlreadySentError,
    CampaignNotFoundError,
)
from app.services.campaign_service import send_campaign as send_campaign_async
from app.services.sms_service import (
    SmsCampaignAlreadySentError,
    SmsCampaignNotFoundError,
    send_sms_campaign as send_sms_campaign_async,
)
from app.services import mail_service
from app.services.email_domain_service import auto_verify_pending
from app.services.whatsapp_health_service import run_all as run_whatsapp_health
from app.services.notification_service import run_all_org_alerts
from app.services.social_service import (
    due_post_ids,
    recover_stuck,
    PostNotPublishableError,
    SocialPostNotFoundError,
    publish_post as publish_social_post_async,
)
from app.workers.celery_app import celery_app


# ── Email campaign task ───────────────────────────────────────────────────────


async def _send_campaign(org_id: str, campaign_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await send_campaign_async(db, uuid.UUID(org_id), uuid.UUID(campaign_id))
        except (CampaignAlreadySentError, CampaignNotFoundError):
            pass
    # asyncio.run() opens a fresh event loop per task; dispose the engine's
    # connection pool so the next task's loop gets fresh asyncpg connections
    # (not stale ones bound to the previous closed loop).
    await engine.dispose()


@celery_app.task(name="send_campaign_task")
def send_campaign_task(org_id: str, campaign_id: str) -> None:
    asyncio.run(_send_campaign(org_id, campaign_id))


# ── Social post publish task ──────────────────────────────────────────────────


async def _publish_social_post(org_id: str, post_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await publish_social_post_async(db, uuid.UUID(org_id), uuid.UUID(post_id))
        except (SocialPostNotFoundError, PostNotPublishableError):
            pass
    await engine.dispose()


@celery_app.task(name="publish_social_post_task")
def publish_social_post_task(org_id: str, post_id: str) -> None:
    asyncio.run(_publish_social_post(org_id, post_id))


# ── SMS / WhatsApp campaign task ──────────────────────────────────────────────


async def _send_sms_campaign(org_id: str, campaign_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await send_sms_campaign_async(db, uuid.UUID(org_id), uuid.UUID(campaign_id))
        except (SmsCampaignAlreadySentError, SmsCampaignNotFoundError):
            pass
    await engine.dispose()


@celery_app.task(name="send_sms_campaign_task")
def send_sms_campaign_task(org_id: str, campaign_id: str) -> None:
    asyncio.run(_send_sms_campaign(org_id, campaign_id))


# ── Daily wallet / usage alert task ───────────────────────────────────────────


async def _check_wallet_and_usage_alerts() -> dict:
    async with AsyncSessionLocal() as db:
        summary = await run_all_org_alerts(db)
    await engine.dispose()
    return summary


@celery_app.task(name="check_wallet_and_usage_alerts")
def check_wallet_and_usage_alerts_task() -> dict:
    return asyncio.run(_check_wallet_and_usage_alerts())


# ── Sending-domain DNS auto-verification ──────────────────────────────────────


async def _auto_verify_domains() -> dict:
    async with AsyncSessionLocal() as db:
        summary = await auto_verify_pending(db)
        summary["inbox"] = await mail_service.auto_verify_inbox_pending(db)
    await engine.dispose()
    return summary


@celery_app.task(name="auto_verify_sending_domains_task")
def auto_verify_sending_domains_task() -> dict:
    return asyncio.run(_auto_verify_domains())


# ── CRM follow-up reminders ───────────────────────────────────────────────────


async def _send_task_reminders() -> dict:
    from app.services.crm_sales_service import send_due_task_reminders  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        summary = await send_due_task_reminders(db)
    await engine.dispose()
    return summary


@celery_app.task(name="crm_task_reminders_task")
def crm_task_reminders_task() -> dict:
    return asyncio.run(_send_task_reminders())


# ── WhatsApp connection health (platform + customers' own accounts) ───────────


async def _whatsapp_health() -> dict:
    async with AsyncSessionLocal() as db:
        summary = await run_whatsapp_health(db)
    await engine.dispose()
    return summary


@celery_app.task(name="whatsapp_health_check_task")
def whatsapp_health_check_task() -> dict:
    return asyncio.run(_whatsapp_health())


# ── Scheduled social posts: publisher that runs every minute ──────────────────


async def _publish_due_social_posts() -> dict:
    async with AsyncSessionLocal() as db:
        due = await due_post_ids(db)
        recovered = await recover_stuck(db)
        for org_id, post_id in due:
            try:
                await publish_social_post_async(db, org_id, post_id)
            except (SocialPostNotFoundError, PostNotPublishableError):
                pass
    await engine.dispose()
    return {"published_or_failed": len(due), "recovered": recovered}


@celery_app.task(name="publish_due_social_posts_task")
def publish_due_social_posts_task() -> dict:
    return asyncio.run(_publish_due_social_posts())


# ── Shared inbox: file a received email; daily clean-up ───────────────────────


async def _process_inbound_mail(note: dict) -> int:
    async with AsyncSessionLocal() as db:
        n = await mail_service.process_notification(db, note)
    await engine.dispose()
    return n


@celery_app.task(name="process_inbound_mail_task", bind=True, max_retries=5)
def process_inbound_mail_task(self, note: dict) -> int:
    try:
        return asyncio.run(_process_inbound_mail(note))
    except Exception as e:  # noqa: BLE001 — S3 may lag a moment behind the notification; retry with back-off
        raise self.retry(exc=e, countdown=20 * (2 ** self.request.retries))


async def _mail_cleanup() -> dict:
    async with AsyncSessionLocal() as db:
        out = await mail_service.purge_old(db)
    await engine.dispose()
    return out


@celery_app.task(name="mail_cleanup_task")
def mail_cleanup_task() -> dict:
    return asyncio.run(_mail_cleanup())
