"""Company-side people management: invite, roles, per-module access, removal, workload."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import ALL, CATALOG, ROLE_DEFAULTS, effective_permissions
from app.core.security import create_invite_token, hash_password
from app.integrations.email_client import email_client
from app.models.contact import Contact
from app.models.crm import CrmTask, TeamAccessPreset, TeamAuditLog
from app.models.enums import TenantRole
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.core.exceptions import PlanLimitError
from app.services.plan_service import get_plan_limit


INVITE_DAYS = 7  # matches create_invite_token's lifetime


class TeamError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def audit(db: AsyncSession, org_id: uuid.UUID, actor: uuid.UUID | None, target: uuid.UUID | None, action: str, detail: str) -> None:
    db.add(TeamAuditLog(organization_id=org_id, actor_user_id=actor, target_user_id=target, action=action, detail=detail[:500]))


def _can_manage(actor: OrganizationMember, target_role: TenantRole) -> bool:
    """Owners manage everyone; admins manage members and sales only."""
    if actor.role == TenantRole.OWNER:
        return True
    return actor.role == TenantRole.ADMIN and target_role in (TenantRole.MEMBER, TenantRole.SALES)


def _clean_permissions(role: TenantRole, perms: list[str] | None) -> list[str] | None:
    if role in (TenantRole.OWNER, TenantRole.ADMIN) or perms is None:
        return None
    bad = [p for p in perms if p not in CATALOG]
    if bad:
        raise TeamError(f"Unknown permission: {bad[0]}")
    # A restricted sales role can't be handed company-level powers by mistake.
    return [p for p in ALL if p in perms]


async def _owner_count(db: AsyncSession, org_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count(OrganizationMember.id)).where(
        OrganizationMember.organization_id == org_id, OrganizationMember.role == TenantRole.OWNER,
        OrganizationMember.is_active.is_(True))) or 0


async def _send_invite(db: AsyncSession, org: Organization, user: User, inviter: User | None) -> bool:
    token = create_invite_token(str(user.id))
    try:
        await email_client.send_email(
            db, org_id=org.id, to_email=user.email,
            subject=f"{inviter.email if inviter else 'Your company'} invited you to {org.name} on LeadBangla",
            html_body=f'<p>You have been added to <strong>{org.name}</strong> on LeadBangla.</p>'
                      f'<p><a href="{settings.app_base_url}/accept-invite?token={token}">Set your password and sign in &rarr;</a></p>',
        )
        return True
    except Exception:  # noqa: BLE001 — email trouble must not block the action
        return False


def invite_link(user: User) -> str:
    return f"{settings.app_base_url}/accept-invite?token={create_invite_token(str(user.id))}"


async def list_members(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(OrganizationMember, User).join(User, User.id == OrganizationMember.user_id)
        .where(OrganizationMember.organization_id == org_id).order_by(OrganizationMember.created_at))).all()
    leads = dict((await db.execute(
        select(Contact.owner_user_id, func.count(Contact.id)).where(
            Contact.organization_id == org_id, Contact.deleted_at.is_(None), Contact.owner_user_id.isnot(None))
        .group_by(Contact.owner_user_id))).all())
    now = datetime.now(timezone.utc)
    open_tasks: dict = {}
    overdue: dict = {}
    for uid, due in (await db.execute(
            select(CrmTask.assignee_user_id, CrmTask.due_at).where(
                CrmTask.organization_id == org_id, CrmTask.done_at.is_(None), CrmTask.assignee_user_id.isnot(None)))):
        open_tasks[uid] = open_tasks.get(uid, 0) + 1
        if due < now:
            overdue[uid] = overdue.get(uid, 0) + 1
    out = []
    for m, u in rows:
        out.append({
            "user_id": u.id, "email": u.email, "role": m.role.value, "job_title": m.job_title,
            "is_active": m.is_active, "invite_pending": m.invite_pending,
            "invite_expired": bool(m.invite_pending and m.invited_at and (now - m.invited_at).days >= INVITE_DAYS),
            "last_seen_at": m.last_seen_at,
            "permissions": effective_permissions(m.role, m.permissions),
            "custom_permissions": m.permissions is not None,
            "joined_at": m.created_at,
            "leads_owned": leads.get(u.id, 0), "open_tasks": open_tasks.get(u.id, 0), "overdue_tasks": overdue.get(u.id, 0),
        })
    return out


def _password_for(provided: str | None) -> str:
    """The owner's chosen password, or a readable random one. Same minimum as sign-up."""
    pw = (provided or "").strip()
    if not pw:
        return secrets.token_urlsafe(9)
    if len(pw) < 8:
        raise TeamError("A password needs at least 8 characters.")
    return pw


async def add_member(
    db: AsyncSession, actor: OrganizationMember, actor_user: User, *, email: str, role: TenantRole,
    permissions: list[str] | None, job_title: str | None, password_mode: str = "invite", password: str | None = None,
) -> dict:
    org_id = actor.organization_id
    if not _can_manage(actor, role):
        raise TeamError("Only the owner can add admins or other owners.", 403)
    email = email.strip().lower()
    limit = await get_plan_limit(db, org_id, "team_members_limit")
    if limit != -1:
        count = await db.scalar(select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org_id)) or 0
        if count >= limit:
            raise PlanLimitError("team_members", count, limit)
    perms = _clean_permissions(role, permissions)
    user = await db.scalar(select(User).where(User.email == email))
    if user is not None:
        in_company = await db.scalar(select(OrganizationMember.id).where(OrganizationMember.user_id == user.id))
        if in_company is not None or user.is_active or user.internal_role is not None:
            raise TeamError("This email already has a LeadBangla account. A person can belong to only one company — ask them to use a different email.", 409)
        # A previously removed person coming back: switch the login on again with a fresh password.
        user.is_active = True
    direct = password_mode == "set"
    temp_password = _password_for(password) if direct else None
    hashed = hash_password(temp_password if direct else uuid.uuid4().hex)
    if user is not None:              # a removed person coming back
        user.hashed_password = hashed
        user.must_change_password = direct
    else:
        user = User(email=email, hashed_password=hashed, must_change_password=direct)
        db.add(user)
    await db.flush()
    db.add(OrganizationMember(
        organization_id=org_id, user_id=user.id, role=role, permissions=perms, job_title=(job_title or None),
        invite_pending=not direct, invited_at=None if direct else datetime.now(timezone.utc), invited_by_user_id=actor.user_id))
    audit(db, org_id, actor.user_id, user.id, "member_added",
          f"Created account for {email} as {role.value}" if direct else f"Invited {email} as {role.value}")
    await db.commit()
    if direct:
        return {"email": email, "invite_sent": False, "invite_link": None, "temporary_password": temp_password}
    org = await db.get(Organization, org_id)
    sent = await _send_invite(db, org, user, actor_user)
    return {"email": email, "invite_sent": sent, "invite_link": None if sent else invite_link(user), "temporary_password": None}


async def _target(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> OrganizationMember:
    m = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id))
    if m is None:
        raise TeamError("Member not found", 404)
    return m


async def update_member(
    db: AsyncSession, actor: OrganizationMember, user_id: uuid.UUID, *, role: TenantRole | None,
    permissions: list[str] | None, permissions_set: bool, is_active: bool | None, job_title: str | None, job_title_set: bool,
) -> None:
    org_id = actor.organization_id
    m = await _target(db, org_id, user_id)
    user = await db.get(User, user_id)
    if not _can_manage(actor, m.role):
        raise TeamError("You can't change this person. Ask the owner.", 403)
    is_self = user_id == actor.user_id
    if is_self and (role not in (None, m.role) or is_active is False):
        raise TeamError("You can't change your own role or switch off your own access.", 400)

    new_role = role or m.role
    notes: list[tuple[str, str]] = []
    if role is not None and role != m.role:
        if not _can_manage(actor, role):
            raise TeamError("Only the owner can make someone an admin or owner.", 403)
        if m.role == TenantRole.OWNER and await _owner_count(db, org_id) <= 1:
            raise TeamError("A company needs at least one owner. Make someone else an owner first.", 409)
        audit(db, org_id, actor.user_id, user_id, "role_changed", f"{user.email}: {m.role.value} → {role.value}")
        notes.append(("role_changed", f"Your role is now {role.value}"))
        m.role = role
        if role in (TenantRole.OWNER, TenantRole.ADMIN):
            m.permissions = None
    if permissions_set:
        cleaned = _clean_permissions(new_role, permissions)
        if cleaned != m.permissions:
            notes.append(("access_changed", "Your access to areas of LeadBangla was updated"))
            audit(db, org_id, actor.user_id, user_id, "access_changed",
                  f"{user.email}: access set to " + ("role default" if cleaned is None else ", ".join(CATALOG[p][0] for p in cleaned) or "nothing"))
        m.permissions = cleaned
    if is_active is not None and is_active != m.is_active:
        if is_active is False and m.role == TenantRole.OWNER and await _owner_count(db, org_id) <= 1:
            raise TeamError("You can't switch off the only owner.", 409)
        m.is_active = is_active
        audit(db, org_id, actor.user_id, user_id, "access_on" if is_active else "access_off",
              f"{user.email}: access turned {'on' if is_active else 'off'}")
    if job_title_set:
        m.job_title = (job_title or "").strip() or None
    await db.commit()
    from app.services import inbox  # noqa: PLC0415

    for kind, text in notes:
        await inbox.notify(db, org_id, [user_id], category="team", kind=kind, title=text, link="/profile", actor_id=actor.user_id)


async def remove_member(db: AsyncSession, actor: OrganizationMember, user_id: uuid.UUID) -> dict:
    org_id = actor.organization_id
    m = await _target(db, org_id, user_id)
    user = await db.get(User, user_id)
    if user_id == actor.user_id:
        raise TeamError("You can't remove yourself.", 400)
    if not _can_manage(actor, m.role):
        raise TeamError("You can't remove this person. Ask the owner.", 403)
    if m.role == TenantRole.OWNER and await _owner_count(db, org_id) <= 1:
        raise TeamError("You can't remove the only owner.", 409)
    # Their work doesn't vanish: leads become unowned, open tasks go to whoever removed them.
    leads = (await db.execute(update(Contact).where(Contact.organization_id == org_id, Contact.owner_user_id == user_id)
                              .values(owner_user_id=None))).rowcount
    tasks = (await db.execute(update(CrmTask).where(CrmTask.organization_id == org_id, CrmTask.assignee_user_id == user_id, CrmTask.done_at.is_(None))
                              .values(assignee_user_id=actor.user_id, reminded_at=None))).rowcount
    await db.delete(m)
    # The login account is freed so the person can be invited again (or join another company).
    user.is_active = False
    audit(db, org_id, actor.user_id, user_id, "member_removed",
          f"Removed {user.email} ({leads} leads un-assigned, {tasks} open tasks moved to you)")
    await db.commit()
    return {"leads_unassigned": leads, "tasks_reassigned": tasks}


async def resend_invite(db: AsyncSession, actor: OrganizationMember, actor_user: User, user_id: uuid.UUID) -> dict:
    m = await _target(db, actor.organization_id, user_id)
    if not m.invite_pending:
        raise TeamError("This person has already set a password.", 400)
    user = await db.get(User, user_id)
    org = await db.get(Organization, actor.organization_id)
    m.invited_at = datetime.now(timezone.utc)
    await db.commit()
    sent = await _send_invite(db, org, user, actor_user)
    return {"invite_sent": sent, "invite_link": None if sent else invite_link(user)}


async def list_audit(db: AsyncSession, org_id: uuid.UUID, limit: int = 50) -> list[dict]:
    rows = (await db.execute(
        select(TeamAuditLog, User.email).outerjoin(User, User.id == TeamAuditLog.actor_user_id)
        .where(TeamAuditLog.organization_id == org_id).order_by(TeamAuditLog.created_at.desc()).limit(limit))).all()
    return [{"id": a.id, "action": a.action, "detail": a.detail, "actor": email, "created_at": a.created_at} for a, email in rows]


# ── Named access presets (e.g. "Telesales" = contacts + CRM + SMS) ───────────

async def list_presets(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    rows = await db.scalars(select(TeamAccessPreset).where(TeamAccessPreset.organization_id == org_id).order_by(TeamAccessPreset.name))
    return [{"id": p.id, "name": p.name, "permissions": p.permissions} for p in rows]


async def save_preset(db: AsyncSession, actor: OrganizationMember, name: str, permissions: list[str]) -> dict:
    name = name.strip()
    if not name:
        raise TeamError("Give the preset a name")
    cleaned = _clean_permissions(TenantRole.MEMBER, permissions) or []
    existing = await db.scalar(select(TeamAccessPreset).where(
        TeamAccessPreset.organization_id == actor.organization_id, func.lower(TeamAccessPreset.name) == name.lower()))
    if existing is None:
        count = await db.scalar(select(func.count(TeamAccessPreset.id)).where(TeamAccessPreset.organization_id == actor.organization_id)) or 0
        if count >= 20:
            raise TeamError("You can keep up to 20 presets")
        existing = TeamAccessPreset(organization_id=actor.organization_id, name=name[:60], permissions=cleaned)
        db.add(existing)
    else:
        existing.permissions = cleaned
    audit(db, actor.organization_id, actor.user_id, None, "preset_saved", f"Access preset “{name}” saved")
    await db.commit()
    await db.refresh(existing)
    return {"id": existing.id, "name": existing.name, "permissions": existing.permissions}


async def delete_preset(db: AsyncSession, actor: OrganizationMember, preset_id: uuid.UUID) -> bool:
    p = await db.get(TeamAccessPreset, preset_id)
    if not p or p.organization_id != actor.organization_id:
        return False
    audit(db, actor.organization_id, actor.user_id, None, "preset_deleted", f"Access preset “{p.name}” deleted")
    await db.delete(p)
    await db.commit()
    return True


async def reset_password(db: AsyncSession, actor: OrganizationMember, actor_user: User, user_id: uuid.UUID, *, mode: str, password: str | None) -> dict:
    """mode 'link': email a set-password link. mode 'set': choose (or generate) a temporary password now."""
    m = await _target(db, actor.organization_id, user_id)
    if user_id == actor.user_id:
        raise TeamError("Use Profile → Change password for your own account.", 400)
    if not _can_manage(actor, m.role):
        raise TeamError("You can't reset this person's password. Ask the owner.", 403)
    user = await db.get(User, user_id)
    if mode == "set":
        temp = _password_for(password)
        user.hashed_password = hash_password(temp)
        user.must_change_password = True
        m.invite_pending = False
        audit(db, actor.organization_id, actor.user_id, user_id, "password_reset", f"Set a temporary password for {user.email}")
        await db.commit()
        return {"invite_sent": False, "invite_link": None, "temporary_password": temp}
    if mode != "link":
        raise TeamError("Unknown reset method")
    org = await db.get(Organization, actor.organization_id)
    audit(db, actor.organization_id, actor.user_id, user_id, "password_reset", f"Sent a password reset link to {user.email}")
    await db.commit()
    sent = await _send_invite(db, org, user, actor_user)
    return {"invite_sent": sent, "invite_link": None if sent else invite_link(user), "temporary_password": None}
