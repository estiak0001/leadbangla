"""Admin-editable subject/body for each kind of internal transactional email.

Every send site renders its fixed template key through `render_template`,
which fills in {{placeholder}} tokens and returns a (subject, body_html) pair
ready for EmailClient.send_system_email — the branding wrapper (logo, colors,
footer) is applied there, not here.
"""
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_template import PlatformEmailTemplate

# key -> (display name, default subject, default body, placeholder docs)
DEFAULTS: dict[str, dict[str, str | list[str]]] = {
    "signup_otp": {
        "name": "Signup verification code",
        "subject": "Your {{brand_name}} verification code",
        "body_html": (
            '<p>Use this code to verify your email and finish creating your {{brand_name}} account:</p>\n'
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">{{code}}</p>\n'
            "<p>This code expires in {{ttl_minutes}} minutes. If you didn't request this, you can ignore this email.</p>"
        ),
        "placeholders": ["brand_name", "code", "ttl_minutes"],
    },
    "password_reset_otp": {
        "name": "Password reset code",
        "subject": "Reset your {{brand_name}} password",
        "body_html": (
            "<p>Use this code to reset your password on {{brand_name}}:</p>\n"
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">{{code}}</p>\n'
            "<p>This code expires in {{ttl_minutes}} minutes. If you didn't request this, you can safely ignore "
            "this email — your password won't change.</p>"
        ),
        "placeholders": ["brand_name", "code", "ttl_minutes"],
    },
    "team_invite": {
        "name": "Team member invite",
        "subject": "{{inviter}} invited you to {{org_name}} on {{brand_name}}",
        "body_html": (
            "<p>You have been added to <strong>{{org_name}}</strong> on {{brand_name}}.</p>\n"
            '<p><a href="{{link}}">Set your password and sign in &rarr;</a></p>'
        ),
        "placeholders": ["inviter", "org_name", "brand_name", "link"],
    },
    "tenant_owner_invite": {
        "name": "New tenant owner invite (set up by staff)",
        "subject": "You've been added to {{brand_name}} — set up {{org_name}}",
        "body_html": (
            "<p>An account has been created for you as the owner of <strong>{{org_name}}</strong> "
            "on {{brand_name}}.</p>\n"
            '<p><a href="{{link}}">Set your password &rarr;</a></p>'
        ),
        "placeholders": ["org_name", "brand_name", "link"],
    },
    "tenant_ready": {
        "name": "Tenant set up (existing user)",
        "subject": "{{org_name}} is ready on {{brand_name}}",
        "body_html": (
            "<p>Your organization <strong>{{org_name}}</strong> has been set up.</p>\n"
            '<p><a href="{{link}}">Log in &rarr;</a></p>'
        ),
        "placeholders": ["org_name", "brand_name", "link"],
    },
    "task_due": {
        "name": "CRM task due reminder",
        "subject": "Task due: {{task_title}}{{who_suffix}}",
        "body_html": (
            "<p>Your task{{who_clause}} is due.</p>\n"
            "<p><strong>{{task_title}}</strong></p>\n"
            "<p>Was due {{due_date}}.</p>"
        ),
        "placeholders": ["task_title", "who_suffix", "who_clause", "due_date"],
    },
}

_PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def _fill(text: str, ctx: dict) -> str:
    return _PLACEHOLDER.sub(lambda m: str(ctx.get(m.group(1), "")), text)


async def _ensure_seeded(db: AsyncSession, key: str) -> PlatformEmailTemplate:
    row = await db.get(PlatformEmailTemplate, key)
    if row is None:
        d = DEFAULTS[key]
        row = PlatformEmailTemplate(key=key, name=str(d["name"]), subject=str(d["subject"]), body_html=str(d["body_html"]))
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def list_templates(db: AsyncSession) -> list[PlatformEmailTemplate]:
    for key in DEFAULTS:
        await _ensure_seeded(db, key)
    rows = await db.scalars(select(PlatformEmailTemplate).order_by(PlatformEmailTemplate.key))
    return list(rows)


async def get_template(db: AsyncSession, key: str) -> PlatformEmailTemplate:
    if key not in DEFAULTS:
        raise KeyError(key)
    return await _ensure_seeded(db, key)


async def update_template(db: AsyncSession, key: str, *, subject: str, body_html: str, updated_by: str | None) -> PlatformEmailTemplate:
    row = await get_template(db, key)
    row.subject = subject
    row.body_html = body_html
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row


async def render_template(db: AsyncSession, key: str, **ctx: str) -> tuple[str, str]:
    """Returns (subject, body_html) with {{placeholder}} tokens filled from ctx
    (plus brand_name, added automatically from the company settings)."""
    from app.services.company_settings_service import get_settings as get_company_settings  # noqa: PLC0415 — avoid a circular import at module load

    template = await get_template(db, key)
    company = await get_company_settings(db)
    full_ctx = {"brand_name": company.company_name, **ctx}
    return _fill(template.subject, full_ctx), _fill(template.body_html, full_ctx)
