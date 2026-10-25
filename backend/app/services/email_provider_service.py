"""Decides which backend actually delivers email, from real configuration only.

Priority: Amazon SES (admin Integration Hub, or AWS_* env) > SMTP (env, for
local development) > none. There is deliberately no "fake" provider: if nothing
is configured, sending fails with a clear message.
"""
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cred_crypto import decrypt_creds
from app.models.platform_service import PlatformService

NOT_CONFIGURED_MESSAGE = (
    "No email provider is connected, so emails cannot be sent. "
    "An administrator needs to connect Amazon SES in the admin panel (Integration Hub)."
)


class EmailNotConfiguredError(Exception):
    def __init__(self) -> None:
        super().__init__(NOT_CONFIGURED_MESSAGE)


@dataclass
class EmailProvider:
    kind: str  # "ses" | "smtp" | "none"
    label: str
    config: dict = field(default_factory=dict)

    @property
    def configured(self) -> bool:
        return self.kind != "none"


async def get_ses_config(db: AsyncSession) -> dict | None:
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == "amazon_ses"))
    if svc and svc.is_enabled and svc.is_live and svc.credentials_enc:
        c = decrypt_creds(svc.credentials_enc)
        if c.get("access_key_id") and c.get("secret_access_key"):
            return {
                "access_key_id": c["access_key_id"],
                "secret_access_key": c["secret_access_key"],
                "region": (c.get("region") or "us-east-1").strip(),
                "configuration_set": (c.get("configuration_set") or "").strip(),
                "default_from_email": (c.get("default_from_email") or "").strip(),
                "public_api_url": (c.get("public_api_url") or "").strip().rstrip("/"),
                "webhook_secret": (c.get("webhook_secret") or "").strip(),
                "inbound_bucket": (c.get("inbound_bucket") or "").strip(),
                "inbound_prefix": (c.get("inbound_prefix") or "inbox/").strip().strip("/") + "/",
                "inbound_topic_arn": (c.get("inbound_topic_arn") or "").strip(),
            }
    if settings.email_provider == "ses" and settings.aws_access_key_id and settings.aws_secret_access_key:
        return {
            "access_key_id": settings.aws_access_key_id,
            "secret_access_key": settings.aws_secret_access_key,
            "region": settings.aws_region,
            "configuration_set": settings.ses_configuration_set,
            "default_from_email": settings.default_from_email,
            "public_api_url": "",
            "webhook_secret": "",
            "inbound_bucket": "", "inbound_prefix": "inbox/", "inbound_topic_arn": "",
        }
    return None


async def get_provider(db: AsyncSession) -> EmailProvider:
    ses = await get_ses_config(db)
    if ses:
        return EmailProvider("ses", f"Amazon SES ({ses['region']})", ses)
    if settings.email_provider == "smtp":
        return EmailProvider("smtp", f"SMTP server {settings.smtp_host}:{settings.smtp_port}")
    return EmailProvider("none", "Not connected")


async def webhook_secret(db: AsyncSession) -> str:
    ses = await get_ses_config(db)
    return (ses or {}).get("webhook_secret") or settings.email_webhook_secret


async def public_api_base(db: AsyncSession) -> str:
    ses = await get_ses_config(db)
    return ((ses or {}).get("public_api_url") or settings.backend_public_url).rstrip("/")
