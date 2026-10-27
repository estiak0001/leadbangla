"""Sales-side CRM: follow-up tasks, call/visit log, owners, custom fields,
baki (due) ledger, consent log and reports. Stage/board logic lives in crm_service."""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from uuid import uuid4

from sqlalchemy import and_, case, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.crm import (
    ConsentLog, CrmActivity, CrmDue, CrmSettings, CrmTask, CrmTaskComment, CustomFieldDefinition, PipelineStage,
)
from app.models.organization import OrganizationMember
from app.models.user import User
from app.services import crm_service, inbox

logger = logging.getLogger(__name__)

SOURCES = ["facebook", "whatsapp", "messenger", "instagram", "website", "referral", "walk_in", "phone_call", "event", "import", "other"]
TASK_KINDS = {"follow_up", "call", "visit", "meeting", "payment"}
ACTIVITY_KINDS = {"call", "visit", "meeting"}


class CrmError(Exception):
    pass


async def _contact(db: AsyncSession, org_id: UUID, contact_id: UUID) -> Contact:
    c = await db.get(Contact, contact_id)
    if not c or c.organization_id != org_id or c.deleted_at is not None:
        raise CrmError("Contact not found")
    return c


# ---------------------------------------------------------------------------
# Contact sales profile
# ---------------------------------------------------------------------------

PROFILE_FIELDS = ("company", "address", "source", "whatsapp_number", "facebook_url", "customer_type", "expected_close_date")


async def clean_custom_fields(db: AsyncSession, org_id: UUID, values: dict, *, keep_blank: bool = False, strict: bool = True,
                              errors: list[str] | None = None) -> dict:
    """Validate values against the company's field definitions. Unknown keys are dropped.
    Blank values become None when keep_blank (so callers can clear a field). With strict=False a bad value is
    skipped and reported through `errors` instead of raising (CSV import)."""
    defs = {d.key: d for d in await list_custom_fields(db, org_id)}
    out: dict = {}
    for k, v in (values or {}).items():
        d = defs.get(k)
        if d is None:
            continue
        if v in (None, ""):
            if keep_blank:
                out[k] = None
            continue
        problem = None
        if d.field_type == "number":
            try:
                v = float(v)
            except (TypeError, ValueError):
                problem = f"'{d.label}' must be a number"
        elif d.field_type == "select" and d.options:
            match = next((o for o in d.options if o.lower() == str(v).strip().lower()), None)
            if match is None:
                problem = f"'{d.label}' must be one of: {', '.join(d.options)}"
            v = match
        if problem:
            if strict:
                raise CrmError(problem)
            if errors is not None:
                errors.append(problem)
            continue
        out[k] = v
    return out


async def update_profile(db: AsyncSession, org_id: UUID, contact_id: UUID, data: dict, user_id: UUID | None) -> Contact:
    contact = await _contact(db, org_id, contact_id)
    for f in PROFILE_FIELDS:
        if f in data:
            v = data[f]
            if isinstance(v, str):
                v = v.strip() or None
            setattr(contact, f, v)
    if any(k in data for k in ("division", "district", "area", "city")):
        from app.services.location_service import resolve_place  # noqa: PLC0415

        place = await resolve_place(db, org_id, division=data.get("division"), district=data.get("district"), area=data.get("area"), city=data.get("city"))
        contact.division, contact.district, contact.area, contact.city = place["division"], place["district"], place["area"], place["city"]
    if "latitude" in data or "longitude" in data:
        from app.services.geo import check_pair  # noqa: PLC0415

        try:
            contact.latitude, contact.longitude = check_pair(data.get("latitude"), data.get("longitude"))
        except ValueError as e:
            raise CrmError(str(e))
    if "deal_value" in data:
        v = data["deal_value"]
        contact.deal_value = None if v in (None, "") else int(round(float(v) * 100))
    if "custom_fields" in data and data["custom_fields"] is not None:
        merged = dict(contact.custom_fields or {})
        for k, v in (await clean_custom_fields(db, org_id, data["custom_fields"], keep_blank=True)).items():
            if v is None:
                merged.pop(k, None)
            else:
                merged[k] = v
        contact.custom_fields = merged
    await db.commit()
    await db.refresh(contact)
    return contact


async def set_owner(db: AsyncSession, org_id: UUID, contact_id: UUID, owner_user_id: UUID | None, by_user_id: UUID | None) -> Contact:
    contact = await _contact(db, org_id, contact_id)
    name = "Unassigned"
    if owner_user_id is not None:
        member = await db.scalar(select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id, OrganizationMember.user_id == owner_user_id))
        if member is None:
            raise CrmError("That person is not on your team")
        user = await db.get(User, owner_user_id)
        name = user.email if user else str(owner_user_id)
    if contact.owner_user_id == owner_user_id:
        return contact
    contact.owner_user_id = owner_user_id
    await crm_service.log_activity(db, org_id, contact_id, "owner_change", f"Owner set to {name}", by_user_id,
                                   {"owner": str(owner_user_id) if owner_user_id else None})
    await db.commit()
    await db.refresh(contact)
    if owner_user_id is not None:
        by = await db.get(User, by_user_id) if by_user_id else None
        await inbox.notify(db, org_id, [owner_user_id], category="leads", kind="lead_assigned",
                           title=f"{_person(by)} assigned you a lead: {_lead_name(contact)}", link=f"/contacts/{contact.id}", actor_id=by_user_id,
                           email_html=f"<p>{_person(by)} assigned you a lead:</p><p><strong>{_lead_name(contact)}</strong></p>")
    return contact


async def log_contact_activity(db: AsyncSession, org_id: UUID, contact_id: UUID, kind: str, summary: str, user_id: UUID | None) -> CrmActivity:
    if kind not in ACTIVITY_KINDS:
        raise CrmError("Unknown activity type")
    contact = await _contact(db, org_id, contact_id)
    contact.last_contacted_at = datetime.now(timezone.utc)
    act = await crm_service.log_activity(db, org_id, contact_id, kind, summary or kind.title(), user_id)
    await db.commit()
    await db.refresh(act)
    return act


# ---------------------------------------------------------------------------
# Tasks / follow-ups
# ---------------------------------------------------------------------------

def _task_dict(t: CrmTask, c: Contact | None, now: datetime) -> dict:
    name = ""
    if c is not None:
        name = (" ".join(x for x in [c.first_name, c.last_name] if x) or c.company or c.email or c.phone or "")
    return {
        "id": t.id, "contact_id": t.contact_id, "contact_name": name, "contact_phone": c.phone if c else None,
        "title": t.title, "kind": t.kind, "due_at": t.due_at, "done_at": t.done_at,
        "assignee_user_id": t.assignee_user_id, "created_by_user_id": t.created_by_user_id,
        "priority": t.priority, "description": t.description,
        "overdue": t.done_at is None and t.due_at < now,
    }


def _dhaka(dt: datetime) -> str:
    return (dt + timedelta(hours=6)).strftime("%d %b %Y, %I:%M %p")


def _lead_name(c: Contact) -> str:
    return " ".join(x for x in [c.first_name, c.last_name] if x) or c.company or c.email or c.phone or "a lead"


def _person(u: User | None) -> str:
    return u.email.split("@")[0] if u else "A teammate"


def _task_link(task: CrmTask) -> str:
    return f"/contacts/{task.contact_id}" if task.contact_id else "/crm?tab=tasks"


async def _notify_assignee(db: AsyncSession, org_id: UUID, task: CrmTask, by_user_id: UUID | None) -> None:
    """Bell + (if wanted) email for the person a task was handed to."""
    if task.assignee_user_id is None or task.assignee_user_id == by_user_id:
        return
    by = await db.get(User, by_user_id) if by_user_id else None
    await inbox.notify(
        db, org_id, [task.assignee_user_id], category="tasks", kind="task_assigned",
        title=f"{_person(by)} assigned you a task: {task.title}",
        body=f"Due {_dhaka(task.due_at)} · priority {task.priority}", link=_task_link(task), actor_id=by_user_id,
        email_html=f"<p>{_person(by)} assigned you a task:</p><p><strong>{task.title}</strong></p><p>Due {_dhaka(task.due_at)} (Dhaka) · priority {task.priority}</p>")


async def _check_assignee(db: AsyncSession, org_id: UUID, user_id: UUID | None) -> None:
    if user_id is None:
        return
    m = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id, OrganizationMember.is_active.is_(True)))
    if m is None:
        raise CrmError("That person is not an active member of your team")


async def create_task(
    db: AsyncSession, org_id: UUID, contact_id: UUID | None, *, title: str, due_at: datetime, kind: str = "follow_up",
    assignee_user_id: UUID | None, created_by: UUID | None, priority: str = "normal", description: str | None = None,
) -> CrmTask:
    contact = await _contact(db, org_id, contact_id) if contact_id else None
    if kind not in TASK_KINDS:
        kind = "follow_up"
    if priority not in ("low", "normal", "high"):
        priority = "normal"
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    await _check_assignee(db, org_id, assignee_user_id)
    task = CrmTask(
        organization_id=org_id, contact_id=contact_id, title=title.strip()[:300], kind=kind, due_at=due_at,
        assignee_user_id=assignee_user_id or (contact.owner_user_id if contact else None) or created_by,
        created_by_user_id=created_by, priority=priority, description=(description or "").strip() or None,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    await _notify_assignee(db, org_id, task, created_by)
    return task


async def list_tasks(
    db: AsyncSession, org_id: UUID, *, scope: str = "open", assignee: UUID | None = None, contact_id: UUID | None = None,
    tz_offset_minutes: int = 360, assigned_by: UUID | None = None, unassigned: bool = False,
) -> list[dict]:
    """scope: overdue | today | upcoming | open | done. 'today' uses the viewer's day (Bangladesh = UTC+6 by default)."""
    now = datetime.now(timezone.utc)
    local_now = now + timedelta(minutes=tz_offset_minutes)
    day_start = (local_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(minutes=tz_offset_minutes))
    day_end = day_start + timedelta(days=1)

    q = select(CrmTask, Contact).outerjoin(Contact, Contact.id == CrmTask.contact_id).where(
        CrmTask.organization_id == org_id, or_(Contact.id.is_(None), Contact.deleted_at.is_(None)))
    if assignee:
        q = q.where(CrmTask.assignee_user_id == assignee)
    if unassigned:
        q = q.where(CrmTask.assignee_user_id.is_(None))
    if assigned_by:
        q = q.where(CrmTask.created_by_user_id == assigned_by, CrmTask.assignee_user_id != assigned_by)
    if contact_id:
        q = q.where(CrmTask.contact_id == contact_id)
    if scope == "done":
        q = q.where(CrmTask.done_at.isnot(None)).order_by(CrmTask.done_at.desc()).limit(100)
    else:
        q = q.where(CrmTask.done_at.is_(None))
        if scope == "overdue":
            q = q.where(CrmTask.due_at < now)
        elif scope == "today":
            q = q.where(CrmTask.due_at < day_end)       # today + anything overdue
        elif scope == "upcoming":
            q = q.where(CrmTask.due_at >= day_end)
        q = q.order_by(CrmTask.due_at).limit(300)
    rows = await db.execute(q)
    return [_task_dict(t, c, now) for t, c in rows]


async def task_counts(db: AsyncSession, org_id: UUID, assignee: UUID | None, tz_offset_minutes: int = 360) -> dict:
    out = {}
    for scope in ("overdue", "today", "upcoming"):
        out[scope] = len(await list_tasks(db, org_id, scope=scope, assignee=assignee, tz_offset_minutes=tz_offset_minutes))
    return out


_UNSET = object()


async def update_task(db: AsyncSession, org_id: UUID, task_id: UUID, *, done: bool | None, due_at: datetime | None,
                      title: str | None, user_id: UUID | None, assignee: object = _UNSET,
                      priority: str | None = None, description: str | None = None) -> CrmTask:
    task = await db.get(CrmTask, task_id)
    if not task or task.organization_id != org_id:
        raise CrmError("Task not found")
    reassigned = False
    if title is not None and title.strip():
        task.title = title.strip()[:300]
    if description is not None:
        task.description = description.strip() or None
    if priority in ("low", "normal", "high"):
        task.priority = priority
    if assignee is not _UNSET and assignee != task.assignee_user_id:
        await _check_assignee(db, org_id, assignee)  # type: ignore[arg-type]
        task.assignee_user_id = assignee  # type: ignore[assignment]
        task.reminded_at = None
        reassigned = True
    if due_at is not None:
        task.due_at = due_at if due_at.tzinfo else due_at.replace(tzinfo=timezone.utc)
        task.reminded_at = None
    if done is True and task.done_at is None:
        task.done_at = datetime.now(timezone.utc)
        if task.contact_id:
            contact = await db.get(Contact, task.contact_id)
            if contact:
                contact.last_contacted_at = task.done_at
            await crm_service.log_activity(db, org_id, task.contact_id, "task_done", f"Completed: {task.title}", user_id)
    elif done is False:
        task.done_at = None
    just_done = done is True and task.done_at is not None and (datetime.now(timezone.utc) - task.done_at).total_seconds() < 5
    await db.commit()
    await db.refresh(task)
    if reassigned:
        await _notify_assignee(db, org_id, task, user_id)
    if just_done and task.created_by_user_id and task.created_by_user_id != user_id:
        who = await db.get(User, user_id) if user_id else None
        await inbox.notify(db, org_id, [task.created_by_user_id], category="tasks", kind="task_done",
                           title=f"{_person(who)} completed: {task.title}", link=_task_link(task), actor_id=user_id,
                           email_html=f"<p>{_person(who)} marked your task <strong>{task.title}</strong> as done.</p>")
    return task


async def delete_task(db: AsyncSession, org_id: UUID, task_id: UUID) -> bool:
    task = await db.get(CrmTask, task_id)
    if not task or task.organization_id != org_id:
        return False
    await db.delete(task)
    await db.commit()
    return True


async def send_due_task_reminders(db: AsyncSession) -> dict:
    """Beat job: one email per overdue-and-unreminded task to its assignee (or the org owner)."""
    from app.models.enums import TenantRole  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    rows = (await db.execute(
        select(CrmTask, Contact).outerjoin(Contact, Contact.id == CrmTask.contact_id)
        .where(CrmTask.done_at.is_(None), CrmTask.reminded_at.is_(None), CrmTask.due_at <= now,
               or_(Contact.id.is_(None), Contact.deleted_at.is_(None)))
        .limit(200)
    )).all()
    sent = skipped = 0
    for task, contact in rows:
        settings = await db.get(CrmSettings, task.organization_id)
        if settings is not None and not settings.task_reminders:
            task.reminded_at = now
            skipped += 1
            continue
        uid = task.assignee_user_id
        if uid is None:
            uid = await db.scalar(select(OrganizationMember.user_id).where(
                OrganizationMember.organization_id == task.organization_id, OrganizationMember.role == TenantRole.OWNER))
        user = await db.get(User, uid) if uid else None
        if user is None:
            task.reminded_at = now
            skipped += 1
            continue
        who = (" ".join(x for x in [contact.first_name, contact.last_name] if x) or contact.company or contact.email or contact.phone or "a lead") if contact else None
        from app.services.email_template_service import render_template  # noqa: PLC0415

        subject, email_html = await render_template(
            db, "task_due",
            task_title=task.title,
            who_suffix=f" — {who}" if who else "",
            who_clause=f" with <strong>{who}</strong>" if who else "",
            due_date=_dhaka(task.due_at),
        )
        res = await inbox.notify(
            db, task.organization_id, [user.id], category="tasks", kind="task_due",
            title=subject, body=f"Was due {_dhaka(task.due_at)}", link=_task_link(task),
            email_html=email_html)
        sent += res["email"]
        skipped += 0 if (res["email"] or res["in_app"]) else 1
        task.reminded_at = now      # never retry forever; the task still shows as overdue in the app
    await db.commit()
    return {"sent": sent, "skipped": skipped}


# ---------------------------------------------------------------------------
# Custom fields
# ---------------------------------------------------------------------------

async def list_custom_fields(db: AsyncSession, org_id: UUID) -> list[CustomFieldDefinition]:
    return list(await db.scalars(
        select(CustomFieldDefinition).where(CustomFieldDefinition.organization_id == org_id)
        .order_by(CustomFieldDefinition.position, CustomFieldDefinition.label)))


async def create_custom_field(db: AsyncSession, org_id: UUID, label: str, field_type: str, options: list[str]) -> CustomFieldDefinition:
    label = label.strip()
    if not label:
        raise CrmError("Give the field a name")
    if field_type not in {"text", "number", "date", "select"}:
        raise CrmError("Unknown field type")
    key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or "field"
    existing = await list_custom_fields(db, org_id)
    if len(existing) >= 20:
        raise CrmError("You can have up to 20 custom fields")
    if any(d.key == key for d in existing):
        raise CrmError("A field with this name already exists")
    d = CustomFieldDefinition(organization_id=org_id, key=key, label=label[:100], field_type=field_type,
                              options=[o.strip() for o in options if o.strip()] if field_type == "select" else [],
                              position=len(existing))
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


async def update_custom_field(db: AsyncSession, org_id: UUID, field_id: UUID, label: str, options: list[str]) -> CustomFieldDefinition:
    d = await db.get(CustomFieldDefinition, field_id)
    if not d or d.organization_id != org_id:
        raise CrmError("Field not found")
    label = label.strip()
    if not label:
        raise CrmError("Give the field a name")
    d.label = label[:100]
    if d.field_type == "select":
        d.options = [o.strip() for o in options if o.strip()]
        if not d.options:
            raise CrmError("A choice field needs at least one choice")
    await db.commit()
    await db.refresh(d)
    return d


async def reorder_custom_fields(db: AsyncSession, org_id: UUID, ids: list[UUID]) -> list[CustomFieldDefinition]:
    defs = {d.id: d for d in await list_custom_fields(db, org_id)}
    for i, fid in enumerate(ids):
        if fid in defs:
            defs[fid].position = i
    await db.commit()
    return await list_custom_fields(db, org_id)


async def delete_custom_field(db: AsyncSession, org_id: UUID, field_id: UUID) -> bool:
    d = await db.get(CustomFieldDefinition, field_id)
    if not d or d.organization_id != org_id:
        return False
    await db.delete(d)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Consent log
# ---------------------------------------------------------------------------

def log_consent(db: AsyncSession, org_id: UUID, contact_id: UUID, channel: str, granted: bool, method: str, user_id: UUID | None = None) -> None:
    db.add(ConsentLog(organization_id=org_id, contact_id=contact_id, channel=channel, granted=granted, method=method,
                      recorded_by_user_id=user_id))


async def list_consent(db: AsyncSession, org_id: UUID, contact_id: UUID) -> list[dict]:
    rows = await db.execute(
        select(ConsentLog, User.email).outerjoin(User, User.id == ConsentLog.recorded_by_user_id)
        .where(ConsentLog.organization_id == org_id, ConsentLog.contact_id == contact_id)
        .order_by(ConsentLog.created_at.desc()).limit(100))
    return [{"id": c.id, "channel": c.channel, "granted": c.granted, "method": c.method,
             "recorded_by": email, "created_at": c.created_at} for c, email in rows]


# ---------------------------------------------------------------------------
# Baki / due ledger  (amounts in paisa)
# ---------------------------------------------------------------------------

async def add_due_entry(db: AsyncSession, org_id: UUID, contact_id: UUID, *, kind: str, amount_taka: float,
                        note: str | None, due_date: date | None, user_id: UUID | None) -> CrmDue:
    await _contact(db, org_id, contact_id)
    if kind not in ("due", "payment"):
        raise CrmError("Entry must be a due or a payment")
    paisa = int(round(float(amount_taka) * 100))
    if paisa <= 0:
        raise CrmError("Amount must be greater than zero")
    e = CrmDue(organization_id=org_id, contact_id=contact_id, kind=kind, amount=paisa, note=(note or None),
               due_date=due_date, created_by_user_id=user_id)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


async def contact_dues(db: AsyncSession, org_id: UUID, contact_id: UUID) -> dict:
    rows = list(await db.scalars(
        select(CrmDue).where(CrmDue.organization_id == org_id, CrmDue.contact_id == contact_id).order_by(CrmDue.created_at.desc())))
    balance = sum(e.amount if e.kind == "due" else -e.amount for e in rows)
    return {"balance": balance, "entries": rows}


async def delete_due_entry(db: AsyncSession, org_id: UUID, entry_id: UUID) -> bool:
    e = await db.get(CrmDue, entry_id)
    if not e or e.organization_id != org_id:
        return False
    await db.delete(e)
    await db.commit()
    return True


async def dues_overview(db: AsyncSession, org_id: UUID, scope_owner: UUID | None = None) -> dict:
    bal = func.sum(case((CrmDue.kind == "due", CrmDue.amount), else_=-CrmDue.amount))
    oldest = func.min(case((CrmDue.kind == "due", CrmDue.due_date), else_=None))
    q = (select(Contact, bal.label("balance"), oldest.label("next_due"))
         .join(CrmDue, CrmDue.contact_id == Contact.id)
         .where(CrmDue.organization_id == org_id, Contact.deleted_at.is_(None))
         .group_by(Contact.id).having(bal > 0).order_by(bal.desc()).limit(200))
    if scope_owner:
        q = q.where(Contact.owner_user_id == scope_owner)
    rows = (await db.execute(q)).all()
    today = date.today()
    items = [{
        "contact_id": c.id,
        "name": " ".join(x for x in [c.first_name, c.last_name] if x) or c.company or c.email or c.phone or "—",
        "phone": c.phone, "balance": int(b), "next_due_date": nd,
        "overdue": bool(nd and nd < today),
    } for c, b, nd in rows]
    return {"total": sum(i["balance"] for i in items), "count": len(items), "items": items}


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

async def reports(db: AsyncSession, org_id: UUID, days: int = 30, scope_owner: UUID | None = None) -> dict:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    stages = await crm_service.list_stages(db, org_id)
    by_id = {s.id: s for s in stages}
    base = [Contact.organization_id == org_id, Contact.deleted_at.is_(None)]
    if scope_owner:
        base.append(Contact.owner_user_id == scope_owner)

    # Funnel: where leads sit now + average time in the current stage
    funnel = []
    total_leads = 0
    for s in stages:
        cnt, val, avg_age = (await db.execute(
            select(func.count(Contact.id), func.coalesce(func.sum(Contact.deal_value), 0),
                   func.avg(func.extract("epoch", now - func.coalesce(Contact.stage_changed_at, Contact.created_at))))
            .where(*base, Contact.pipeline_stage_id == s.id))).one()
        total_leads += cnt
        funnel.append({"stage_id": s.id, "name": s.name, "color": s.color, "outcome": s.outcome, "count": cnt,
                       "value": int(val), "avg_days_in_stage": round((avg_age or 0) / 86400, 1), "probability": s.probability,
                       "stale_days": s.stale_days})
    for f in funnel:
        f["share"] = round(100 * f["count"] / total_leads, 1) if total_leads else 0

    won_ids = [s.id for s in stages if s.outcome == "won"]
    lost_ids = [s.id for s in stages if s.outcome == "lost"]
    open_ids = [s.id for s in stages if s.outcome == "open"]

    async def _count(ids, since_filter: bool, value: bool = False):
        if not ids:
            return 0
        cols = func.coalesce(func.sum(Contact.deal_value), 0) if value else func.count(Contact.id)
        conds = [*base, Contact.pipeline_stage_id.in_(ids)]
        if since_filter:
            conds.append(Contact.stage_changed_at >= since)
        return int(await db.scalar(select(cols).where(*conds)) or 0)

    won, lost = await _count(won_ids, True), await _count(lost_ids, True)
    summary = {
        "days": days,
        "total_leads": total_leads,
        "new_leads": int(await db.scalar(select(func.count(Contact.id)).where(*base, Contact.created_at >= since)) or 0),
        "won": won, "lost": lost,
        "win_rate": round(100 * won / (won + lost), 1) if (won + lost) else None,
        "pipeline_value": await _count(open_ids, False, value=True),
        "won_value": await _count(won_ids, True, value=True),
        # Weighted forecast: each open stage's deal value x that stage's win probability.
        "forecast": int(sum(f["value"] * (f["probability"] or 0) / 100 for f in funnel if f["outcome"] == "open" and f["probability"] is not None)),
        "forecast_missing": sum(1 for f in funnel if f["outcome"] == "open" and f["value"] > 0 and f["probability"] is None),
    }

    # Lost reasons
    reasons = (await db.execute(
        select(Contact.lost_reason, func.count(Contact.id)).where(*base, Contact.lost_reason.isnot(None))
        .group_by(Contact.lost_reason).order_by(func.count(Contact.id).desc()).limit(8))).all()

    # Leads by source (+ how many were won and their value)
    src_rows = (await db.execute(
        select(Contact.source, Contact.pipeline_stage_id, func.count(Contact.id), func.coalesce(func.sum(Contact.deal_value), 0))
        .where(*base).group_by(Contact.source, Contact.pipeline_stage_id))).all()
    sources: dict[str, dict] = {}
    for src, sid, cnt, val in src_rows:
        d = sources.setdefault(src or "unknown", {"source": src or "unknown", "leads": 0, "won": 0, "won_value": 0})
        d["leads"] += cnt
        if sid in won_ids:
            d["won"] += cnt
            d["won_value"] += int(val)
    by_source = sorted(sources.values(), key=lambda x: -x["leads"])

    # Activity per person
    team = {t["user_id"]: t for t in await crm_service.list_team(db, org_id)}
    act_rows = (await db.execute(
        select(CrmActivity.user_id, CrmActivity.kind, func.count(CrmActivity.id))
        .where(CrmActivity.organization_id == org_id, CrmActivity.created_at >= since, CrmActivity.user_id.isnot(None))
        .group_by(CrmActivity.user_id, CrmActivity.kind))).all()
    own_rows = (await db.execute(
        select(Contact.owner_user_id, func.count(Contact.id)).where(*base, Contact.owner_user_id.isnot(None))
        .group_by(Contact.owner_user_id))).all()
    people: dict[UUID, dict] = {}
    def person(uid):
        t = team.get(uid, {})
        return people.setdefault(uid, {"user_id": uid, "name": t.get("email", "Unknown"), "leads_owned": 0,
                                        "calls": 0, "visits": 0, "meetings": 0, "stage_moves": 0, "tasks_done": 0})
    for uid, n in own_rows:
        person(uid)["leads_owned"] = n
    if scope_owner:      # restricted roles see only their own numbers
        person(scope_owner)
    kind_key = {"call": "calls", "visit": "visits", "meeting": "meetings", "stage_change": "stage_moves", "task_done": "tasks_done"}
    for uid, kind, n in act_rows:
        if kind in kind_key:
            person(uid)[kind_key[kind]] += n
    if scope_owner:
        people = {k: v for k, v in people.items() if k == scope_owner}

    # Follow-up compliance: tasks that fell due in the period
    trows = (await db.execute(
        select(CrmTask.due_at, CrmTask.done_at).where(CrmTask.organization_id == org_id, CrmTask.due_at >= since, CrmTask.due_at <= now,
                                                      *([CrmTask.assignee_user_id == scope_owner] if scope_owner else [])))).all()
    on_time = sum(1 for due, done in trows if done and done <= due + timedelta(hours=24))
    late = sum(1 for due, done in trows if done and done > due + timedelta(hours=24))
    missed = sum(1 for _, done in trows if not done)
    compliance = {"due": len(trows), "on_time": on_time, "late": late, "missed": missed,
                  "rate": round(100 * on_time / len(trows), 1) if trows else None}

    extra = await _report_extras(db, org_id, base, stages, won_ids, lost_ids, since, now, days)
    return {"summary": summary, "funnel": funnel, "lost_reasons": [{"reason": r, "count": n} for r, n in reasons],
            "by_source": by_source, "people": list(people.values()), "follow_up": compliance, **extra}


async def _report_extras(db: AsyncSession, org_id: UUID, base: list, stages, won_ids, lost_ids, since: datetime, now: datetime, days: int) -> dict:
    """The deeper analytics: daily trend, places, customer types, lead quality, sales cycle, stage movement, dues, tasks."""
    from app.models.crm import PipelineStage  # noqa: PLC0415

    # Daily trend: new leads, and how many were won / lost that day
    new_rows = dict((await db.execute(select(func.date(Contact.created_at), func.count(Contact.id)).where(*base, Contact.created_at >= since).group_by(func.date(Contact.created_at)))).all())
    won_rows = dict((await db.execute(select(func.date(Contact.stage_changed_at), func.count(Contact.id)).where(
        *base, Contact.pipeline_stage_id.in_(won_ids or [uuid4()]), Contact.stage_changed_at >= since).group_by(func.date(Contact.stage_changed_at)))).all())
    lost_rows = dict((await db.execute(select(func.date(Contact.stage_changed_at), func.count(Contact.id)).where(
        *base, Contact.pipeline_stage_id.in_(lost_ids or [uuid4()]), Contact.stage_changed_at >= since).group_by(func.date(Contact.stage_changed_at)))).all())
    trend = []
    for i in range(days + 1):
        d = (since + timedelta(days=i)).date()
        trend.append({"date": d.isoformat(), "new": int(new_rows.get(d, 0)), "won": int(won_rows.get(d, 0)), "lost": int(lost_rows.get(d, 0))})

    # Places and customer types (leads, won, won value)
    async def grouped(col):
        rows = (await db.execute(select(col, Contact.pipeline_stage_id, func.count(Contact.id), func.coalesce(func.sum(Contact.deal_value), 0)).where(*base).group_by(col, Contact.pipeline_stage_id))).all()
        out: dict = {}
        for key, sid, cnt, val in rows:
            d = out.setdefault(key or "unknown", {"name": key or "unknown", "leads": 0, "won": 0, "won_value": 0, "pipeline": 0})
            d["leads"] += cnt
            if sid in won_ids:
                d["won"] += cnt
                d["won_value"] += int(val)
            elif sid not in lost_ids:
                d["pipeline"] += int(val)
        return sorted(out.values(), key=lambda x: -x["leads"])
    by_district = (await grouped(Contact.district))[:10]
    by_type = await grouped(Contact.customer_type)

    # Lead quality: hot / warm / cold by lead score
    ids = list(await db.scalars(select(Contact.id).where(*base).limit(5000)))
    scores = await crm_service.bulk_lead_scores(db, org_id, ids)
    bonus = {c.id: crm_service._profile_bonus(c) for c in await db.scalars(select(Contact).where(Contact.id.in_(ids)))} if ids else {}
    bands = {"hot": 0, "warm": 0, "cold": 0}
    for cid in ids:
        sc = scores.get(cid, 0) + bonus.get(cid, 0)
        bands["hot" if sc >= 60 else "warm" if sc >= 30 else "cold"] += 1

    # Sales cycle: average days from first contact to won
    cycle = None
    if won_ids:
        avg = await db.scalar(select(func.avg(func.greatest(0, func.extract("epoch", Contact.stage_changed_at - Contact.created_at)))).where(
            *base, Contact.pipeline_stage_id.in_(won_ids), Contact.stage_changed_at.isnot(None), Contact.stage_changed_at >= since))
        cycle = round(avg / 86400, 1) if avg is not None else None

    # Stage movement: how many leads entered each stage in the period
    dest = literal_column("crm_activities.data ->> 'to'")
    moved = dict((await db.execute(select(dest, func.count(CrmActivity.id)).where(
        CrmActivity.organization_id == org_id, CrmActivity.kind == "stage_change", CrmActivity.created_at >= since).group_by(dest))).all())
    stage_flow = [{"stage_id": s.id, "name": s.name, "color": s.color, "outcome": s.outcome, "entered": int(moved.get(str(s.id), 0))} for s in stages]

    # Slow leads (a stage can set "flag after N days")
    stale = 0
    for s in stages:
        if s.outcome == "open" and s.stale_days:
            stale += int(await db.scalar(select(func.count(Contact.id)).where(
                *base, Contact.pipeline_stage_id == s.id, func.coalesce(Contact.stage_changed_at, Contact.created_at) < now - timedelta(days=s.stale_days))) or 0)

    # Dues and tasks
    owing = await dues_overview(db, org_id)
    tasks_open = int(await db.scalar(select(func.count(CrmTask.id)).where(CrmTask.organization_id == org_id, CrmTask.done_at.is_(None))) or 0)
    tasks_overdue = int(await db.scalar(select(func.count(CrmTask.id)).where(CrmTask.organization_id == org_id, CrmTask.done_at.is_(None), CrmTask.due_at < now)) or 0)
    tasks_done = int(await db.scalar(select(func.count(CrmTask.id)).where(CrmTask.organization_id == org_id, CrmTask.done_at >= since)) or 0)
    return {
        "trend": trend, "by_district": by_district, "by_type": by_type, "score_bands": bands, "sales_cycle_days": cycle,
        "stage_flow": stage_flow, "stale_leads": stale,
        "dues": {"total": owing["total"], "customers": owing["count"], "overdue": sum(1 for i in owing["items"] if i["overdue"])},
        "tasks": {"open": tasks_open, "overdue": tasks_overdue, "done": tasks_done},
    }


async def team_activity(db: AsyncSession, org_id: UUID, days: int = 30, user_id: UUID | None = None, kind: str | None = None,
                        only_user: UUID | None = None) -> dict:
    """Per-person sales activity for the Team tab: scorecards, a daily chart, a live feed and (for one person) their open work."""
    from app.models.crm import PipelineStage  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    stages = await crm_service.list_stages(db, org_id)
    won_ids = [s.id for s in stages if s.outcome == "won"]
    lost_ids = [s.id for s in stages if s.outcome == "lost"]
    open_ids = [s.id for s in stages if s.outcome == "open"]
    members = (await db.execute(
        select(OrganizationMember, User).join(User, User.id == OrganizationMember.user_id)
        .where(OrganizationMember.organization_id == org_id, OrganizationMember.is_active.is_(True),
               *([OrganizationMember.user_id == only_user] if only_user else [])).order_by(OrganizationMember.created_at))).all()
    if only_user:
        user_id = only_user      # the daily chart, feed and detail follow the same person
    live = [Contact.organization_id == org_id, Contact.deleted_at.is_(None)]

    people = []
    for m, u in members:
        uid = u.id
        mine = [*live, Contact.owner_user_id == uid]
        leads = int(await db.scalar(select(func.count(Contact.id)).where(*mine)) or 0)
        open_leads = int(await db.scalar(select(func.count(Contact.id)).where(*mine, Contact.pipeline_stage_id.in_(open_ids or [uuid4()]))) or 0)
        pipeline = int(await db.scalar(select(func.coalesce(func.sum(Contact.deal_value), 0)).where(*mine, Contact.pipeline_stage_id.in_(open_ids or [uuid4()]))) or 0)
        won = int(await db.scalar(select(func.count(Contact.id)).where(*mine, Contact.pipeline_stage_id.in_(won_ids or [uuid4()]), Contact.stage_changed_at >= since)) or 0)
        lost = int(await db.scalar(select(func.count(Contact.id)).where(*mine, Contact.pipeline_stage_id.in_(lost_ids or [uuid4()]), Contact.stage_changed_at >= since)) or 0)
        won_value = int(await db.scalar(select(func.coalesce(func.sum(Contact.deal_value), 0)).where(*mine, Contact.pipeline_stage_id.in_(won_ids or [uuid4()]), Contact.stage_changed_at >= since)) or 0)
        acts = dict((await db.execute(select(CrmActivity.kind, func.count(CrmActivity.id)).where(
            CrmActivity.organization_id == org_id, CrmActivity.user_id == uid, CrmActivity.created_at >= since).group_by(CrmActivity.kind))).all())
        last_act = await db.scalar(select(func.max(CrmActivity.created_at)).where(CrmActivity.organization_id == org_id, CrmActivity.user_id == uid))
        t_open = int(await db.scalar(select(func.count(CrmTask.id)).where(CrmTask.organization_id == org_id, CrmTask.assignee_user_id == uid, CrmTask.done_at.is_(None))) or 0)
        t_over = int(await db.scalar(select(func.count(CrmTask.id)).where(CrmTask.organization_id == org_id, CrmTask.assignee_user_id == uid, CrmTask.done_at.is_(None), CrmTask.due_at < now)) or 0)
        done_rows = (await db.execute(select(CrmTask.due_at, CrmTask.done_at).where(
            CrmTask.organization_id == org_id, CrmTask.assignee_user_id == uid, CrmTask.done_at >= since))).all()
        on_time = sum(1 for due, done in done_rows if done <= due + timedelta(hours=24))
        total_acts = sum(acts.get(k, 0) for k in ("call", "visit", "meeting", "stage_change", "task_done", "owner_change"))
        people.append({
            "user_id": uid, "name": u.email.split("@")[0], "email": u.email, "role": m.role.value, "job_title": m.job_title,
            "leads_owned": leads, "open_leads": open_leads, "pipeline_value": pipeline, "won": won, "lost": lost, "won_value": won_value,
            "win_rate": round(100 * won / (won + lost), 1) if (won + lost) else None,
            "calls": acts.get("call", 0), "visits": acts.get("visit", 0), "meetings": acts.get("meeting", 0),
            "stage_moves": acts.get("stage_change", 0), "tasks_done": len(done_rows), "tasks_on_time": on_time,
            "on_time_rate": round(100 * on_time / len(done_rows), 1) if done_rows else None,
            "tasks_open": t_open, "tasks_overdue": t_over, "activities": total_acts,
            "last_active": max([x for x in (last_act, m.last_seen_at) if x], default=None),
        })

    # daily activity (everyone, or one person)
    conds = [CrmActivity.organization_id == org_id, CrmActivity.created_at >= since]
    if user_id:
        conds.append(CrmActivity.user_id == user_id)
    rows = (await db.execute(select(func.date(CrmActivity.created_at), CrmActivity.kind, func.count(CrmActivity.id)).where(*conds).group_by(func.date(CrmActivity.created_at), CrmActivity.kind))).all()
    grid: dict = {}
    for d, k, n in rows:
        grid.setdefault(d, {})[k] = n
    daily = []
    for i in range(days + 1):
        d = (since + timedelta(days=i)).date()
        g = grid.get(d, {})
        daily.append({"date": d.isoformat(), "calls": g.get("call", 0), "visits": g.get("visit", 0), "meetings": g.get("meeting", 0),
                      "stage_moves": g.get("stage_change", 0), "tasks_done": g.get("task_done", 0)})

    # feed
    fq = (select(CrmActivity, Contact, User.email).join(Contact, Contact.id == CrmActivity.contact_id).outerjoin(User, User.id == CrmActivity.user_id)
          .where(CrmActivity.organization_id == org_id).order_by(CrmActivity.created_at.desc()).limit(40))
    if user_id:
        fq = fq.where(CrmActivity.user_id == user_id)
    if kind:
        fq = fq.where(CrmActivity.kind == kind)
    feed = [{"id": a.id, "kind": a.kind, "summary": a.summary, "created_at": a.created_at, "user": (email or "System").split("@")[0],
             "contact_id": c.id, "contact": " ".join(x for x in [c.first_name, c.last_name] if x) or c.company or c.email or c.phone or "Lead"}
            for a, c, email in (await db.execute(fq)).all()]

    detail = None
    if user_id:
        by_stage = (await db.execute(select(PipelineStage.name, PipelineStage.color, func.count(Contact.id)).outerjoin(
            Contact, and_(Contact.pipeline_stage_id == PipelineStage.id, Contact.owner_user_id == user_id, Contact.deleted_at.is_(None)))
            .where(PipelineStage.organization_id == org_id).group_by(PipelineStage.name, PipelineStage.color, PipelineStage.position).order_by(PipelineStage.position))).all()
        trows = (await db.execute(select(CrmTask, Contact).outerjoin(Contact, Contact.id == CrmTask.contact_id).where(
            CrmTask.organization_id == org_id, CrmTask.assignee_user_id == user_id, CrmTask.done_at.is_(None)).order_by(CrmTask.due_at).limit(8))).all()
        detail = {
            "by_stage": [{"name": n, "color": c, "count": int(k)} for n, c, k in by_stage],
            "open_tasks": [{"id": t.id, "title": t.title, "due_at": t.due_at, "overdue": t.due_at < now, "priority": t.priority,
                            "contact": (" ".join(x for x in [c.first_name, c.last_name] if x) or c.company) if c else None,
                            "contact_id": c.id if c else None} for t, c in trows],
        }
    return {"days": days, "people": people, "daily": daily, "feed": feed, "detail": detail}


# ---------------------------------------------------------------------------
# Task comments
# ---------------------------------------------------------------------------

async def _task_for(db: AsyncSession, org_id: UUID, task_id: UUID) -> CrmTask:
    task = await db.get(CrmTask, task_id)
    if not task or task.organization_id != org_id:
        raise CrmError("Task not found")
    return task


async def list_task_comments(db: AsyncSession, org_id: UUID, task_id: UUID) -> list[dict]:
    await _task_for(db, org_id, task_id)
    rows = await db.execute(
        select(CrmTaskComment, User.email).outerjoin(User, User.id == CrmTaskComment.user_id)
        .where(CrmTaskComment.task_id == task_id).order_by(CrmTaskComment.created_at))
    return [{"id": c.id, "body": c.body, "author": email, "user_id": c.user_id, "created_at": c.created_at} for c, email in rows]


async def add_task_comment(db: AsyncSession, org_id: UUID, task_id: UUID, user_id: UUID, body: str) -> dict:
    task = await _task_for(db, org_id, task_id)
    body = body.strip()
    if not body:
        raise CrmError("Write a comment first")
    c = CrmTaskComment(organization_id=org_id, task_id=task_id, user_id=user_id, body=body[:2000])
    db.add(c)
    await db.commit()
    await db.refresh(c)
    me = await db.get(User, user_id)
    await inbox.notify(
        db, org_id, [task.assignee_user_id, task.created_by_user_id], category="tasks", kind="task_comment",
        title=f"{_person(me)} commented on “{task.title}”", body=c.body[:300], link=_task_link(task), actor_id=user_id,
        email_html=f"<p>{_person(me)} commented on <strong>{task.title}</strong>:</p><blockquote>{c.body}</blockquote>")
    return {"id": c.id, "body": c.body, "author": me.email if me else None, "user_id": user_id, "created_at": c.created_at}
