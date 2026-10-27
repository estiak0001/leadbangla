import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.integrations.email_delivery import EmailSendError, send_via_ses, send_via_smtp
from app.services.email_provider_service import EmailNotConfiguredError, get_provider


class EmailClient:
    """Single entry point for sending email. Delivers through Amazon SES (or an
    SMTP server for local development) — see services/email_provider_service.py.
    Never pretends to send: raises EmailNotConfiguredError / EmailSendError."""

    async def send_email(
        self,
        db: AsyncSession,
        *,
        org_id: uuid.UUID | None,
        to_email: str,
        subject: str,
        html_body: str,
        from_email: str | None = None,
        from_name: str | None = None,
        dkim: dict | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> str:
        """Returns the provider's message id for the SENT event."""
        provider = await get_provider(db)
        if provider.kind == "none":
            raise EmailNotConfiguredError()
        if provider.kind == "ses":
            sender = from_email or provider.config.get("default_from_email")
            if not sender:
                raise EmailSendError(
                    "No From address: pick a verified sender in the campaign, or set a Default From Email on the Amazon SES integration."
                )
            return await send_via_ses(
                provider.config, to_email=to_email, subject=subject, html_body=html_body,
                from_email=sender, from_name=from_name, reply_to=reply_to, headers=headers,
            )
        try:
            return await send_via_smtp(
                to_email=to_email, subject=subject, html_body=html_body,
                from_email=from_email or settings.default_from_email, from_name=from_name, dkim=dkim, headers=headers,
            )
        except Exception as e:
            raise EmailSendError(f"SMTP server {settings.smtp_host}:{settings.smtp_port} failed: {e}") from e

    async def send_system_email(
        self,
        db: AsyncSession,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        reply_to: str | None = None,
    ) -> str:
        """For LeadBangla's own internal/transactional email to a user — OTPs,
        invites, alerts, notifications — never for a customer's own campaigns.
        Wraps `html_body` in the admin-editable branding (logo, colors, footer)
        from services/email_branding_service.py before sending."""
        from app.services.company_settings_service import get_settings as get_company_settings  # noqa: PLC0415
        from app.services.email_branding_service import get_branding, render_branded_email  # noqa: PLC0415

        branding = await get_branding(db)
        company = await get_company_settings(db)
        wrapped = render_branded_email(branding, company, subject=subject, inner_html=html_body)
        return await self.send_email(
            db, org_id=None, to_email=to_email, subject=subject, html_body=wrapped,
            from_name=company.company_name, reply_to=reply_to,
        )

    async def send_template_email(
        self,
        db: AsyncSession,
        *,
        key: str,
        to_email: str,
        reply_to: str | None = None,
        **ctx: str,
    ) -> str:
        """Like send_system_email, but the subject/body come from the named,
        admin-editable template (services/email_template_service.py) instead of
        being hardcoded at the call site. `ctx` fills that template's {{tokens}}."""
        from app.services.email_template_service import render_template  # noqa: PLC0415

        subject, html_body = await render_template(db, key, **ctx)
        return await self.send_system_email(db, to_email=to_email, subject=subject, html_body=html_body, reply_to=reply_to)


email_client = EmailClient()
