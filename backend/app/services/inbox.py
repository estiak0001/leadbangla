"""In-app notifications (the bell) with optional email, honouring each person's preferences.

Call `notify(...)` AFTER the caller's own commit: it never raises, and it must not
roll back the caller's work if something here goes wrong."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import effective_permissions
from app.models.enums import TenantRole
from app.models.inbox import Notification, UserNotificationPref
from app.models.organization import OrganizationMember
from app.models.user import User

log = logging.getLogger(__name__)

# key -> (label, description, default in_app, default email)
CATEGORIES: dict[str, tuple[str, str, bool, bool]] = {
    "tasks": ("Tasks & follow-ups", "A task is assigned to you, someone comments or finishes it, or it is due", True, True),
    "leads": ("Leads", "A lead is assigned to you, or one of your deals is won or lost", True, False),
    "team": ("Team & access", "Someone joins your company, or your role or access changes", True, True),
    "campaigns": ("Campaigns", "An email or SMS campaign finishes or fails", True, False),
    "billing": ("Wallet & plan", "Low balance, top-up received, plan limits", True, True),
    "account": ("Sender ID & verification", "A request is approved, rejected or needs more information", True, True),
}


def resolve_prefs(stored: dict | None) -> dict[str, dict[str, bool]]:
    stored = stored or {}
    return {
        k: {"in_app": bool(stored.get(k, {}).get("in_app", d_app)), "email": bool(stored.get(k, {}).get("email", d_mail))}
        for k, (_l, _d, d_app, d_mail) in CATEGORIES.items()
    }


async def get_prefs(db: AsyncSession, user_id: uuid.UUID) -> dict[str, dict[str, bool]]:
    row = await db.get(UserNotificationPref, user_id)
    return resolve_prefs(row.prefs if row else None)


async def save_prefs(db: AsyncSession, user_id: uuid.UUID, patch: dict[str, dict[str, bool]]) -> dict[str, dict[str, bool]]:
    current = await get_prefs(db, user_id)
    for cat, vals in patch.items():
        if cat in current:
            for ch in ("in_app", "email"):
                if ch in vals:
                    current[cat][ch] = bool(vals[ch])
    row = await db.get(UserNotificationPref, user_id)
    if row is None:
        db.add(UserNotificationPref(user_id=user_id, prefs=current))
    else:
        row.prefs = current
    await db.commit()
    return current


async def recipients_with_permission(db: AsyncSession, org_id: uuid.UUID, perm: str) -> list[uuid.UUID]:
    rows = await db.scalars(select(OrganizationMember).where(
        OrganizationMember.organization_id == org_id, OrganizationMember.is_active.is_(True)))
    return [m.user_id for m in rows if perm in effective_permissions(m.role, m.permissions)]


async def owners_and_admins(db: AsyncSession, org_id: uuid.UUID) -> list[uuid.UUID]:
    return list(await db.scalars(select(OrganizationMember.user_id).where(
        OrganizationMember.organization_id == org_id, OrganizationMember.is_active.is_(True),
        OrganizationMember.role.in_([TenantRole.OWNER, TenantRole.ADMIN]))))


async def notify(
    db: AsyncSession, org_id: uuid.UUID, user_ids: list[uuid.UUID | None], *, category: str, kind: str, title: str,
    body: str = "", link: str | None = None, actor_id: uuid.UUID | None = None, email_html: str | None = None,
) -> dict:
    """Create bell entries (and send an email when the person wants one). Skips the actor."""
    result = {"in_app": 0, "email": 0}
    try:
        targets = [u for u in dict.fromkeys(user_ids) if u is not None and u != actor_id]
        if not targets:
            return result
        users = {u.id: u for u in await db.scalars(select(User).where(User.id.in_(targets)))}
        wanted_email: list[User] = []
        for uid in targets:
            if uid not in users:
                continue
            prefs = (await get_prefs(db, uid)).get(category, {"in_app": True, "email": False})
            if prefs["in_app"]:
                db.add(Notification(organization_id=org_id, user_id=uid, category=category, kind=kind, title=title[:300],
                                    body=body[:1000], link=link, actor_user_id=actor_id))
                result["in_app"] += 1
            if prefs["email"] and email_html:
                wanted_email.append(users[uid])
        await db.commit()
        if wanted_email:
            from app.integrations.email_client import email_client  # noqa: PLC0415

            for u in wanted_email:
                try:
                    await email_client.send_email(db, org_id=org_id, to_email=u.email, subject=title,
                                                  html_body=email_html + (f'<p><a href="https://app.leadbangla.com{link}">Open it &rarr;</a></p>' if link else ""))
                    result["email"] += 1
                except Exception as e:  # noqa: BLE001 — email trouble never blocks the action
                    log.warning("Notification email to %s not sent: %s", u.email, e)
    except Exception:  # noqa: BLE001
        log.exception("notify failed")
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
    return result


async def list_for_user(db: AsyncSession, user_id: uuid.UUID, *, unread_only: bool = False, limit: int = 30, offset: int = 0) -> list[Notification]:
    q = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    return list(await db.scalars(q.order_by(Notification.created_at.desc()).offset(offset).limit(limit)))


async def unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user_id, Notification.read_at.is_(None))) or 0


async def mark_read(db: AsyncSession, user_id: uuid.UUID, ids: list[uuid.UUID] | None) -> None:
    q = update(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
    if ids is not None:
        q = q.where(Notification.id.in_(ids))
    await db.execute(q.values(read_at=datetime.now(timezone.utc)))
    await db.commit()
