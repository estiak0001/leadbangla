"""One-click unsubscribe for email campaigns.

Every campaign email carries a personal, signed link. Opening it shows a confirmation page; confirming (or a mail
app's one-click request, RFC 8058) adds the address to the customer's suppression list, so it is never mailed again."""
import html as _html
import re
import uuid

from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.contact import Contact
from app.models.email_domain import EmailSuppression
from app.models.organization import Organization
from app.services.crm_sales_service import log_consent

PLACEHOLDER_RE = re.compile(r"\{\{\s*unsubscribe_url\s*\}\}", re.I)


class SuppressionError(Exception):
    pass


def make_token(org_id: uuid.UUID, email: str, campaign_id: uuid.UUID | None = None) -> str:
    return jwt.encode({"t": "unsub", "o": str(org_id), "e": email.strip().lower(), "c": str(campaign_id) if campaign_id else None},
                      settings.jwt_secret, algorithm=settings.jwt_algorithm)


def read_token(token: str) -> dict | None:
    try:
        d = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    return d if d.get("t") == "unsub" and d.get("o") and d.get("e") else None


def unsubscribe_url(api_base: str, org_id: uuid.UUID, email: str, campaign_id: uuid.UUID | None = None) -> str:
    return f"{api_base.rstrip('/')}/v1/public/unsubscribe/{make_token(org_id, email, campaign_id)}"


def one_click_headers(url: str) -> dict[str, str]:
    """Lets Gmail/Yahoo/Outlook show their own "Unsubscribe" button (RFC 8058)."""
    return {"List-Unsubscribe": f"<{url}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}


def org_footer_lines(org: Organization | None) -> list[str]:
    if org is None:
        return []
    name = org.display_name and f"{org.name} — {org.display_name}" or org.name
    place = ", ".join(x for x in (org.address, org.city, org.country) if x)
    return [x for x in (name, place) if x]


def apply_footer(body: str, url: str, org: Organization | None, *, has_placeholder: bool) -> str:
    """Every marketing email must tell people who sent it and how to stop. If the author put {{unsubscribe_url}}
    in the message we only add the sender line; otherwise we add the unsubscribe link too."""
    lines = [f"<div>{_html.escape(l)}</div>" for l in org_footer_lines(org)]
    link = "" if has_placeholder else (
        f'<div style="margin-top:6px">You received this because you are on this sender\'s mailing list. '
        f'<a href="{_html.escape(url)}" style="color:#6b7280">Unsubscribe</a></div>')
    footer = ('<div style="margin:24px auto 0;padding-top:14px;border-top:1px solid #e5e7eb;max-width:600px;'
              'font:12px/1.5 Arial,sans-serif;color:#6b7280;text-align:center">' + "".join(lines) + link + "</div>")
    if re.search(r"</body>", body, re.I):
        return re.sub(r"</body>", footer + "</body>", body, count=1, flags=re.I)
    return body + footer


async def suppressed_set(db: AsyncSession, org_id: uuid.UUID) -> set[str]:
    return {e.lower() for e in await db.scalars(select(EmailSuppression.email).where(EmailSuppression.organization_id == org_id))}


async def add_suppression(db: AsyncSession, org_id: uuid.UUID, email: str, reason: str) -> bool:
    email = email.strip().lower()
    if await db.scalar(select(EmailSuppression.id).where(EmailSuppression.organization_id == org_id, EmailSuppression.email == email)):
        return False
    db.add(EmailSuppression(organization_id=org_id, email=email, reason=reason))
    return True


async def unsubscribe(db: AsyncSession, token: str) -> dict | None:
    """Apply an unsubscribe. Returns {"business","email"}, or None if the link is not valid."""
    t = read_token(token)
    if t is None:
        return None
    org_id, email = uuid.UUID(t["o"]), t["e"]
    org = await db.get(Organization, org_id)
    if org is None:
        return None
    created = await add_suppression(db, org_id, email, "unsubscribe")
    if created:
        for c in (await db.scalars(select(Contact).where(Contact.organization_id == org_id, func.lower(Contact.email) == email, Contact.deleted_at.is_(None)))).all():
            log_consent(db, org_id, c.id, "email", False, "unsubscribe_link")
    await db.commit()
    return {"business": org.display_name and f"{org.name} — {org.display_name}" or org.name, "email": email}


async def preview(db: AsyncSession, token: str) -> dict | None:
    t = read_token(token)
    org = await db.get(Organization, uuid.UUID(t["o"])) if t else None
    return {"business": org.name, "email": t["e"]} if t and org else None


# ── customer-side list management ────────────────────────────────────────────

async def list_suppressed(db: AsyncSession, org_id: uuid.UUID, *, q: str | None, reason: str | None, limit: int, offset: int) -> list[EmailSuppression]:
    stmt = select(EmailSuppression).where(EmailSuppression.organization_id == org_id)
    if reason:
        stmt = stmt.where(EmailSuppression.reason == reason)
    if q and q.strip():
        stmt = stmt.where(EmailSuppression.email.ilike(f"%{q.strip()}%"))
    return list(await db.scalars(stmt.order_by(EmailSuppression.created_at.desc()).limit(min(limit, 200)).offset(offset)))


async def suppression_counts(db: AsyncSession, org_id: uuid.UUID) -> dict[str, int]:
    rows = (await db.execute(select(EmailSuppression.reason, func.count()).where(EmailSuppression.organization_id == org_id).group_by(EmailSuppression.reason))).all()
    return {r: n for r, n in rows}


async def remove_suppression(db: AsyncSession, org_id: uuid.UUID, suppression_id: uuid.UUID) -> None:
    s = await db.scalar(select(EmailSuppression).where(EmailSuppression.organization_id == org_id, EmailSuppression.id == suppression_id))
    if s is None:
        raise SuppressionError("Not found")
    if s.reason in ("bounce", "complaint"):
        raise SuppressionError("This address bounced or reported spam. Emailing it again would damage your sender reputation, so it can't be removed.")
    await db.delete(s)
    await db.commit()


# ── the public pages ─────────────────────────────────────────────────────────

_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{title}</title>
<style>body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font:16px/1.5 system-ui,Arial,sans-serif;color:#1f2937}}
.card{{max-width:440px;margin:16px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}}
h1{{font-size:20px;margin:0 0 8px}}p{{margin:6px 0;color:#4b5563}}small{{color:#9ca3af}}
button{{margin-top:16px;background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer}}</style></head>
<body><div class="card">{body}</div></body></html>"""


def page_confirm(business: str, email: str) -> str:
    b, e = _html.escape(business), _html.escape(email)
    return _PAGE.format(title="Unsubscribe", body=(
        f"<h1>Unsubscribe from {b}?</h1><p><b>{e}</b> will stop receiving emails from {b}.</p>"
        f"<p>{b} থেকে আর ইমেইল পেতে না চাইলে নিচের বাটনে ক্লিক করুন।</p>"
        '<form method="post"><button type="submit">Unsubscribe · আনসাবস্ক্রাইব</button></form>'))


def page_done(business: str, email: str) -> str:
    b, e = _html.escape(business), _html.escape(email)
    return _PAGE.format(title="Unsubscribed", body=(
        f"<h1>You're unsubscribed ✓</h1><p><b>{e}</b> will no longer receive emails from {b}.</p>"
        "<p>আপনি সফলভাবে আনসাবস্ক্রাইব করেছেন।</p><p><small>It can take a few minutes for any email already sending to stop.</small></p>"))


def page_invalid() -> str:
    return _PAGE.format(title="Link not valid", body="<h1>This link isn't valid</h1><p>It may be incomplete. Please use the unsubscribe link from the email again, or reply to the email and ask to be removed.</p>")
