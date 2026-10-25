from celery import Celery
from celery.schedules import crontab

import app.models  # noqa: F401 — registers every model's mapper, see app/models/__init__.py
from app.core.config import settings

celery_app = Celery(
    "leadbangla",
    broker=settings.redis_url,
    backend=settings.redis_url,
    # `include`, not a top-level import of tasks.py here — tasks.py imports
    # `celery_app` from this module, so importing tasks.py at module-load
    # time would be circular. `include` defers the import until the worker
    # actually starts, after celery_app already exists.
    include=["app.workers.tasks", "app.workers.workflow_runner", "app.workers.seo_crawler"],
)
celery_app.conf.task_default_queue = "default"
celery_app.conf.beat_schedule = {
    "wallet-usage-alerts": {
        "task": "check_wallet_and_usage_alerts",
        "schedule": crontab(hour=9, minute=0),  # daily at 09:00 UTC
    },
    "mail-cleanup": {
        "task": "mail_cleanup_task",
        "schedule": crontab(hour=3, minute=30),  # daily: retention, old trash, unused uploads
    },
    "publish-due-social-posts": {
        "task": "publish_due_social_posts_task",
        "schedule": crontab(),  # every minute
    },
    "whatsapp-health-check": {
        "task": "whatsapp_health_check_task",
        "schedule": crontab(minute=15, hour="*/6"),  # every 6 hours
    },
    "auto-verify-sending-domains": {
        "task": "auto_verify_sending_domains_task",
        "schedule": crontab(minute="*/5"),  # re-check pending domains every 5 minutes
    },
    "crm-task-reminders": {
        "task": "crm_task_reminders_task",
        "schedule": crontab(minute="*/15"),  # email owners about follow-ups that just came due
    },
}
