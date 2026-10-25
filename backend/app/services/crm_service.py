from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.crm import ContactNote, CrmActivity, CrmSettings, CrmTask, PipelineStage
from app.models.enums import EventType, SmsEventType, WorkflowEnrollmentStatus
from app.models.event import Event
from app.models.landing_page import FormSubmission, LandingPage
from app.models.organization import OrganizationMember
from app.models.sms import SmsCampaign, SmsEvent, SmsInboundMessage
from app.models.user import User
from app.models.workflow import Workflow, WorkflowEnrollment


# ---------------------------------------------------------------------------
# Defaults, settings, lead assignment
# ---------------------------------------------------------------------------

DEFAULT_STAGES = [
    ("New", "#3B82F6", "open"),
    ("Contacted", "#8B5CF6", "open"),
    ("Interested", "#F59E0B", "open"),
    ("Negotiation", "#EC4899", "open"),
    ("Customer", "#10B981", "won"),
    ("Lost", "#6B7280", "lost"),
]


DEFAULT_LOST_REASONS = ["Price too high", "Chose a competitor", "No response", "Not interested", "Out of budget", "Wrong number"]
DEFAULT_SOURCES = [
    ("facebook", "Facebook"), ("whatsapp", "WhatsApp"), ("messenger", "Messenger"), ("instagram", "Instagram"), ("website", "Website"),
    ("referral", "Referral"), ("walk_in", "Walk-in"), ("phone_call", "Phone call"), ("event", "Event / expo"), ("import", "Imported"), ("other", "Other"),
]
DEFAULT_BOARD_PREFS = {"show_value": True, "show_company": True, "show_source": True, "show_due": True, "stale_highlight": True, "sort": "recent"}
BOARD_SORTS = ("recent", "value", "waiting")   # newest first / biggest deal first / waiting longest in the stage


def _slug(text: str) -> str:
    import re  # noqa: PLC0415

    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:40]


def settings_view(s: CrmSettings) -> dict:
    return {
        "round_robin": s.round_robin, "task_reminders": s.task_reminders,
        "lost_reasons": s.lost_reasons if s.lost_reasons is not None else list(DEFAULT_LOST_REASONS),
        "sources": s.sources if s.sources is not None else [{"key": k, "label": l} for k, l in DEFAULT_SOURCES],
        "board_prefs": {**DEFAULT_BOARD_PREFS, **(s.board_prefs or {})},
    }


async def list_sources(db: AsyncSession, org_id: UUID) -> list[dict]:
    return settings_view(await ensure_initialized(db, org_id))["sources"]


async def ensure_initialized(db: AsyncSession, org_id: UUID) -> CrmSettings:
    """First touch of the CRM for an org: create its settings row and, if it has
    no stages yet, the default sales pipeline. The settings row is the 'already
    set up' marker, so stages a user later deletes are not silently re-created."""
    settings = await db.get(CrmSettings, org_id)
    if settings is not None:
        return settings
    has_stages = await db.scalar(
        select(func.count(PipelineStage.id)).where(PipelineStage.organization_id == org_id)
    )
    if not has_stages:
        for i, (name, color, outcome) in enumerate(DEFAULT_STAGES):
            db.add(PipelineStage(organization_id=org_id, name=name, position=i, color=color, outcome=outcome))
    settings = CrmSettings(organization_id=org_id)
    db.add(settings)
    await db.flush()
    # Contacts that existed before the CRM was set up join the first open stage.
    first = await db.scalar(
        select(PipelineStage).where(PipelineStage.organization_id == org_id, PipelineStage.outcome == "open")
        .order_by(PipelineStage.position, PipelineStage.created_at).limit(1)
    )
    if first is not None:
        await db.execute(
            Contact.__table__.update()
            .where(Contact.organization_id == org_id, Contact.pipeline_stage_id.is_(None), Contact.deleted_at.is_(None))
            .values(pipeline_stage_id=first.id, stage_changed_at=func.now())
        )
    try:
        await db.commit()
    except Exception:  # concurrent first touch — someone else created it
        await db.rollback()
        settings = await db.get(CrmSettings, org_id)
        if settings is None:
            raise
    return settings


class SettingsError(Exception):
    pass


async def update_settings(db: AsyncSession, org_id: UUID, **kwargs) -> CrmSettings:
    settings = await ensure_initialized(db, org_id)
    lost = kwargs.pop("lost_reasons", None)
    if lost is not None:
        cleaned = list(dict.fromkeys(" ".join(str(x).split())[:60] for x in lost if str(x).strip()))
        if len(cleaned) > 20:
            raise SettingsError("You can keep up to 20 lost reasons")
        settings.lost_reasons = cleaned
    sources = kwargs.pop("sources", None)
    if sources is not None:
        out, seen = [], set()
        for item in sources:
            label = " ".join(str(item.get("label", "")).split())[:40]
            if not label:
                continue
            key = _slug(item.get("key") or label) or "other"
            if key in seen:
                raise SettingsError(f"“{label}” is listed twice")
            seen.add(key)
            out.append({"key": key, "label": label})
        if not out:
            raise SettingsError("Keep at least one lead source")
        if len(out) > 30:
            raise SettingsError("You can keep up to 30 lead sources")
        settings.sources = out
    prefs = kwargs.pop("board_prefs", None)
    if prefs is not None:
        merged = {**DEFAULT_BOARD_PREFS, **(settings.board_prefs or {})}
        for k, v in prefs.items():
            if k in ("show_value", "show_company", "show_source", "show_due", "stale_highlight"):
                merged[k] = bool(v)
            elif k == "sort" and v in BOARD_SORTS:
                merged[k] = v
        settings.board_prefs = merged
    for k, v in kwargs.items():
        if v is not None:
            setattr(settings, k, v)
    await db.commit()
    await db.refresh(settings)
    return settings


async def list_team(db: AsyncSession, org_id: UUID) -> list[dict]:
    rows = await db.execute(
        select(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .where(OrganizationMember.organization_id == org_id, OrganizationMember.is_active.is_(True))
        .order_by(OrganizationMember.created_at)
    )
    return [
        {"user_id": u.id, "email": u.email, "name": u.email.split("@")[0], "role": m.role.value}
        for m, u in rows
    ]


class LeadAssigner:
    """Puts brand-new contacts into the first open stage and (optionally) gives
    them an owner. Built once per request/import so a 5,000-row import does not
    query the team for every row."""

    def __init__(self, first_stage: PipelineStage | None, settings: CrmSettings, team: list[UUID], actor_id: UUID | None, actor_is_sales: bool):
        self.first_stage = first_stage
        self.settings = settings
        self.team = team
        self.actor_id = actor_id
        self.actor_is_sales = actor_is_sales
        self._idx = team.index(settings.last_assigned_user_id) + 1 if settings.last_assigned_user_id in team else 0
        self._moved = False

    @classmethod
    async def create(cls, db: AsyncSession, org_id: UUID, actor_id: UUID | None = None, actor_role: str | None = None) -> "LeadAssigner":
        settings = await ensure_initialized(db, org_id)
        first = await db.scalar(
            select(PipelineStage)
            .where(PipelineStage.organization_id == org_id, PipelineStage.outcome == "open")
            .order_by(PipelineStage.position, PipelineStage.created_at)
            .limit(1)
        )
        team: list[UUID] = []
        if settings.round_robin:
            team = [t["user_id"] for t in await list_team(db, org_id)]
        return cls(first, settings, team, actor_id, actor_role == "sales")

    def apply(self, contact: Contact) -> None:
        now = datetime.now(timezone.utc)
        if contact.pipeline_stage_id is None and self.first_stage is not None:
            contact.pipeline_stage_id = self.first_stage.id
            contact.stage_changed_at = now
        if contact.owner_user_id is None:
            if self.team:
                contact.owner_user_id = self.team[self._idx % len(self.team)]
                self._idx += 1
                self._moved = True
            elif self.actor_is_sales and self.actor_id:
                contact.owner_user_id = self.actor_id

    async def finish(self, db: AsyncSession) -> None:
        if self._moved and self.team:
            self.settings.last_assigned_user_id = self.team[(self._idx - 1) % len(self.team)]


# ---------------------------------------------------------------------------
# Pipeline stage CRUD
# ---------------------------------------------------------------------------

async def list_stages(db: AsyncSession, org_id: UUID) -> list[PipelineStage]:
    await ensure_initialized(db, org_id)
    result = await db.scalars(
        select(PipelineStage)
        .where(PipelineStage.organization_id == org_id)
        .order_by(PipelineStage.position, PipelineStage.created_at)
    )
    return list(result.all())


def _stage_extras(**kw) -> dict:
    """Validated optional per-stage settings (None means "not set")."""
    out: dict = {}
    for k, lo, hi in (("probability", 0, 100), ("stale_days", 1, 365), ("auto_task_days", 0, 365)):
        if k in kw:
            v = kw[k]
            if v is not None and not (lo <= int(v) <= hi):
                raise SettingsError(f"{k.replace('_', ' ').capitalize()} must be between {lo} and {hi}")
            out[k] = None if v is None else int(v)
    if "auto_task_title" in kw:
        out["auto_task_title"] = (kw["auto_task_title"] or "").strip()[:200] or None
    return out


async def create_stage(db: AsyncSession, org_id: UUID, name: str, position: int | None, color: str, outcome: str = "open", **extras) -> PipelineStage:
    await ensure_initialized(db, org_id)
    if position is None:
        position = (await db.scalar(
            select(func.coalesce(func.max(PipelineStage.position), -1)).where(PipelineStage.organization_id == org_id)
        ) or 0) + 1
    stage = PipelineStage(organization_id=org_id, name=name.strip(), position=position, color=color, outcome=outcome, **_stage_extras(**extras))
    db.add(stage)
    await db.commit()
    await db.refresh(stage)
    return stage


async def update_stage(db: AsyncSession, org_id: UUID, stage_id: UUID, **kwargs) -> PipelineStage | None:
    stage = await db.get(PipelineStage, stage_id)
    if not stage or stage.organization_id != org_id:
        return None
    extras = {k: kwargs.pop(k) for k in ("probability", "stale_days", "auto_task_days", "auto_task_title") if k in kwargs}
    for k, v in kwargs.items():
        if v is not None:
            setattr(stage, k, v.strip() if k == "name" else v)
    for k, v in _stage_extras(**extras).items():
        setattr(stage, k, v)
    await db.commit()
    await db.refresh(stage)
    return stage


async def reorder_stages(db: AsyncSession, org_id: UUID, ids: list[UUID]) -> list[PipelineStage]:
    stages = {s.id: s for s in await list_stages(db, org_id)}
    for i, sid in enumerate(ids):
        if sid in stages:
            stages[sid].position = i
    await db.commit()
    return await list_stages(db, org_id)


async def delete_stage(db: AsyncSession, org_id: UUID, stage_id: UUID, move_to: UUID | None = None) -> bool:
    stage = await db.get(PipelineStage, stage_id)
    if not stage or stage.organization_id != org_id:
        return False
    target = None
    if move_to is not None and move_to != stage_id:
        target = await db.get(PipelineStage, move_to)
        if not target or target.organization_id != org_id:
            target = None
    if target is None:      # default: the first remaining open stage
        target_id = await db.scalar(
            select(PipelineStage.id)
            .where(PipelineStage.organization_id == org_id, PipelineStage.id != stage_id, PipelineStage.outcome == "open")
            .order_by(PipelineStage.position).limit(1)
        )
    else:
        target_id = target.id
    await db.execute(
        Contact.__table__.update().where(Contact.pipeline_stage_id == stage_id)
        .values(pipeline_stage_id=target_id, stage_changed_at=func.now())
    )
    await db.delete(stage)
    await db.commit()
    return True


async def stage_lead_counts(db: AsyncSession, org_id: UUID) -> dict[UUID, int]:
    rows = await db.execute(select(Contact.pipeline_stage_id, func.count(Contact.id)).where(
        Contact.organization_id == org_id, Contact.deleted_at.is_(None), Contact.pipeline_stage_id.isnot(None)).group_by(Contact.pipeline_stage_id))
    return {sid: n for sid, n in rows}


# ---------------------------------------------------------------------------
# Lead scoring — bulk (for board) and single (for contact detail)
# Repeated opens of the same email no longer inflate the score: each event type
# counts once per campaign and is capped.
# ---------------------------------------------------------------------------

async def bulk_lead_scores(
    db: AsyncSession, org_id: UUID, contact_ids: list[UUID]
) -> dict[UUID, int]:
    if not contact_ids:
        return {}

    scores: dict[UUID, int] = {cid: 0 for cid in contact_ids}

    rows = await db.execute(
        select(Event.contact_id, Event.type, func.count(distinct(Event.campaign_id)).label("n"))
        .where(
            Event.contact_id.in_(contact_ids),
            Event.organization_id == org_id,
            Event.type.in_([EventType.OPENED, EventType.CLICKED]),
        )
        .group_by(Event.contact_id, Event.type)
    )
    for row in rows:
        pts = 5 if row.type == EventType.OPENED else 10
        scores[row.contact_id] += min(row.n, 5) * pts

    rows = await db.execute(
        select(SmsEvent.contact_id, func.count().label("cnt"))
        .where(
            SmsEvent.contact_id.in_(contact_ids),
            SmsEvent.organization_id == org_id,
            SmsEvent.type == SmsEventType.SENT,
        )
        .group_by(SmsEvent.contact_id)
    )
    for row in rows:
        scores[row.contact_id] += min(row.cnt, 10) * 2

    rows = await db.execute(
        select(FormSubmission.contact_id, func.count().label("cnt"))
        .where(FormSubmission.contact_id.in_(contact_ids), FormSubmission.organization_id == org_id)
        .group_by(FormSubmission.contact_id)
    )
    for row in rows:
        scores[row.contact_id] += min(row.cnt, 3) * 20

    rows = await db.execute(
        select(WorkflowEnrollment.contact_id, func.count().label("cnt"))
        .where(
            WorkflowEnrollment.contact_id.in_(contact_ids),
            WorkflowEnrollment.organization_id == org_id,
            WorkflowEnrollment.status == WorkflowEnrollmentStatus.COMPLETED,
        )
        .group_by(WorkflowEnrollment.contact_id)
    )
    for row in rows:
        scores[row.contact_id] += min(row.cnt, 4) * 5

    return scores


def _profile_bonus(c: Contact) -> int:
    return (5 if c.email else 0) + (5 if c.phone else 0) + (2 if c.first_name else 0) + (2 if c.last_name else 0)


async def calculate_lead_score(db: AsyncSession, org_id: UUID, contact: Contact) -> int:
    engagement = await bulk_lead_scores(db, org_id, [contact.id])
    return _profile_bonus(contact) + engagement.get(contact.id, 0)


# ---------------------------------------------------------------------------
# Pipeline board (paged per column)
# ---------------------------------------------------------------------------

def _filters(org_id: UUID, owner: str | None, q: str | None, scope_owner: UUID | None) -> list:
    conds = [Contact.organization_id == org_id, Contact.deleted_at.is_(None)]
    if scope_owner is not None:                       # restricted sales role: own leads only
        conds.append(Contact.owner_user_id == scope_owner)
    elif owner == "unassigned":
        conds.append(Contact.owner_user_id.is_(None))
    elif owner:
        conds.append(Contact.owner_user_id == UUID(owner))
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(
            Contact.first_name.ilike(like), Contact.last_name.ilike(like), Contact.email.ilike(like),
            Contact.phone.ilike(like), Contact.company.ilike(like),
        ))
    return conds


async def _kanban_cards(db: AsyncSession, org_id: UUID, contacts: list[Contact]) -> list[dict]:
    ids = [c.id for c in contacts]
    raw = await bulk_lead_scores(db, org_id, ids)
    next_due: dict[UUID, datetime] = {}
    if ids:
        rows = await db.execute(
            select(CrmTask.contact_id, func.min(CrmTask.due_at))
            .where(CrmTask.contact_id.in_(ids), CrmTask.done_at.is_(None))
            .group_by(CrmTask.contact_id)
        )
        next_due = {cid: d for cid, d in rows}
    return [
        {
            "id": str(c.id),
            "first_name": c.first_name,
            "last_name": c.last_name,
            "email": c.email,
            "phone": c.phone,
            "whatsapp_number": c.whatsapp_number,
            "company": c.company,
            "city": c.city,
            "district": c.district,
            "area": c.area,
            "source": c.source,
            "tags": c.tags or [],
            "lead_score": _profile_bonus(c) + raw.get(c.id, 0),
            "pipeline_stage_id": str(c.pipeline_stage_id) if c.pipeline_stage_id else None,
            "owner_user_id": str(c.owner_user_id) if c.owner_user_id else None,
            "deal_value": c.deal_value,
            "expected_close_date": c.expected_close_date.isoformat() if c.expected_close_date else None,
            "stage_changed_at": c.stage_changed_at.isoformat() if c.stage_changed_at else None,
            "next_task_due": next_due[c.id].isoformat() if c.id in next_due else None,
        }
        for c in contacts
    ]


async def get_column_contacts(
    db: AsyncSession, org_id: UUID, stage_id: UUID | None, *, offset: int = 0, limit: int = 20,
    owner: str | None = None, q: str | None = None, scope_owner: UUID | None = None, sort: str | None = None,
) -> list[dict]:
    conds = _filters(org_id, owner, q, scope_owner)
    if stage_id is None:
        known = select(PipelineStage.id).where(PipelineStage.organization_id == org_id)
        conds.append(or_(Contact.pipeline_stage_id.is_(None), Contact.pipeline_stage_id.not_in(known)))
    else:
        conds.append(Contact.pipeline_stage_id == stage_id)
    if sort is None:
        sort = settings_view(await ensure_initialized(db, org_id))["board_prefs"]["sort"]
    order = {
        "value": [Contact.deal_value.desc().nulls_last(), Contact.created_at.desc()],
        "waiting": [func.coalesce(Contact.stage_changed_at, Contact.created_at).asc()],
    }.get(sort, [Contact.created_at.desc()])
    rows = await db.scalars(select(Contact).where(*conds).order_by(*order).offset(offset).limit(limit))
    return await _kanban_cards(db, org_id, list(rows))


async def get_pipeline_board(
    db: AsyncSession, org_id: UUID, *, owner: str | None = None, q: str | None = None,
    limit: int = 20, scope_owner: UUID | None = None, sort: str | None = None,
) -> list[dict]:
    stages = await list_stages(db, org_id)
    conds = _filters(org_id, owner, q, scope_owner)

    totals = {}
    rows = await db.execute(
        select(Contact.pipeline_stage_id, func.count(Contact.id), func.coalesce(func.sum(Contact.deal_value), 0))
        .where(*conds).group_by(Contact.pipeline_stage_id)
    )
    known_ids = {s.id for s in stages}
    unassigned_count = unassigned_value = 0
    for sid, cnt, val in rows:
        if sid in known_ids:
            totals[sid] = (cnt, int(val))
        else:
            unassigned_count += cnt
            unassigned_value += int(val)

    columns = []
    for s in stages:
        cnt, val = totals.get(s.id, (0, 0))
        cards = await get_column_contacts(db, org_id, s.id, limit=limit, owner=owner, q=q, scope_owner=scope_owner, sort=sort) if cnt else []
        columns.append({
            "id": str(s.id), "name": s.name, "position": s.position, "color": s.color,
            "outcome": s.outcome, "total": cnt, "value_total": val, "contacts": cards,
            "probability": s.probability, "stale_days": s.stale_days,
        })
    if unassigned_count:
        cards = await get_column_contacts(db, org_id, None, limit=limit, owner=owner, q=q, scope_owner=scope_owner, sort=sort)
        columns.append({
            "id": None, "name": "Unassigned", "position": 9999, "color": "#9CA3AF",
            "outcome": "open", "total": unassigned_count, "value_total": unassigned_value, "contacts": cards,
        })
    return columns


# ---------------------------------------------------------------------------
# Contact stage update (logged + fires the "enters stage" workflow trigger)
# ---------------------------------------------------------------------------

async def log_activity(
    db: AsyncSession, org_id: UUID, contact_id: UUID, kind: str, summary: str,
    user_id: UUID | None = None, data: dict | None = None,
) -> CrmActivity:
    act = CrmActivity(
        organization_id=org_id, contact_id=contact_id, user_id=user_id, kind=kind,
        summary=summary[:500], data=data or {},
    )
    db.add(act)
    return act


async def _auto_follow_up(db: AsyncSession, org_id: UUID, contact: Contact, stage: PipelineStage, user_id: UUID | None) -> None:
    """A stage can ask for a follow-up when a lead enters it ("call in 2 days"). Never creates a duplicate open one."""
    from datetime import timedelta  # noqa: PLC0415

    name = " ".join(x for x in [contact.first_name, contact.last_name] if x) or contact.company or contact.email or contact.phone or "lead"
    title = (stage.auto_task_title or f"Follow up — {stage.name}: {name}").strip()[:300]
    exists = await db.scalar(select(CrmTask.id).where(CrmTask.contact_id == contact.id, CrmTask.title == title, CrmTask.done_at.is_(None)))
    if exists:
        return
    due = (datetime.now(timezone.utc) + timedelta(days=stage.auto_task_days or 0)).replace(hour=4, minute=0, second=0, microsecond=0)   # 10:00 in Bangladesh
    db.add(CrmTask(organization_id=org_id, contact_id=contact.id, title=title,
                   kind="follow_up", due_at=due, assignee_user_id=contact.owner_user_id or user_id, created_by_user_id=user_id))
    await db.commit()


async def set_contact_stage(
    db: AsyncSession, org_id: UUID, contact_id: UUID, stage_id: UUID | None,
    *, user_id: UUID | None = None, lost_reason: str | None = None,
) -> Contact | None:
    contact = await db.get(Contact, contact_id)
    if not contact or contact.organization_id != org_id or contact.deleted_at is not None:
        return None
    new_stage = None
    if stage_id is not None:
        new_stage = await db.get(PipelineStage, stage_id)
        if not new_stage or new_stage.organization_id != org_id:
            return None
    if contact.pipeline_stage_id == stage_id:
        return contact

    old_stage = await db.get(PipelineStage, contact.pipeline_stage_id) if contact.pipeline_stage_id else None
    contact.pipeline_stage_id = stage_id
    contact.stage_changed_at = datetime.now(timezone.utc)
    if new_stage is not None and new_stage.outcome == "lost":
        contact.lost_reason = (lost_reason or "").strip() or contact.lost_reason
    else:
        contact.lost_reason = None
    await log_activity(
        db, org_id, contact_id, "stage_change",
        f"Moved from {old_stage.name if old_stage else 'Unassigned'} to {new_stage.name if new_stage else 'Unassigned'}"
        + (f" — reason: {contact.lost_reason}" if contact.lost_reason else ""),
        user_id, {"from": str(old_stage.id) if old_stage else None, "to": str(stage_id) if stage_id else None},
    )
    await db.commit()
    await db.refresh(contact)
    if new_stage is not None and new_stage.outcome in ("won", "lost") and contact.owner_user_id and contact.owner_user_id != user_id:
        from app.services import inbox  # noqa: PLC0415

        who = await db.get(User, user_id) if user_id else None
        name = " ".join(x for x in [contact.first_name, contact.last_name] if x) or contact.company or contact.email or contact.phone or "A lead"
        verb = "won 🎉" if new_stage.outcome == "won" else "marked lost"
        await inbox.notify(db, org_id, [contact.owner_user_id], category="leads", kind=f"lead_{new_stage.outcome}",
                           title=f"{name} was {verb}" + (f" by {who.email.split('@')[0]}" if who else ""),
                           body=(contact.lost_reason or "") if new_stage.outcome == "lost" else "", link=f"/contacts/{contact.id}", actor_id=user_id)
    if new_stage is not None and new_stage.outcome == "open" and new_stage.auto_task_days is not None:
        await _auto_follow_up(db, org_id, contact, new_stage, user_id)
    if stage_id is not None:
        from app.workers.workflow_runner import fire_workflow_trigger_task  # noqa: PLC0415
        fire_workflow_trigger_task.delay(str(org_id), "stage_entered", str(contact_id), {"stage_id": str(stage_id)})
    return contact


# ---------------------------------------------------------------------------
# Contact timeline
# ---------------------------------------------------------------------------

async def get_contact_timeline(
    db: AsyncSession, org_id: UUID, contact_id: UUID
) -> list[dict]:
    entries: list[dict] = []

    # Email events
    email_rows = await db.execute(
        select(Event, Campaign)
        .join(Campaign, Event.campaign_id == Campaign.id)
        .where(Event.contact_id == contact_id, Event.organization_id == org_id)
        .order_by(Event.occurred_at.desc())
    )
    for ev, camp in email_rows:
        entries.append({
            "timestamp": ev.occurred_at.isoformat(),
            "channel": "email",
            "event_type": ev.type.value,
            "title": f"Email {ev.type.value.title()}",
            "detail": camp.name,
        })

    # SMS events (exclude opted-out skips)
    sms_rows = await db.execute(
        select(SmsEvent, SmsCampaign)
        .join(SmsCampaign, SmsEvent.sms_campaign_id == SmsCampaign.id)
        .where(
            SmsEvent.contact_id == contact_id,
            SmsEvent.organization_id == org_id,
            SmsEvent.opted_out_skip.is_(False),
        )
        .order_by(SmsEvent.occurred_at.desc())
    )
    for ev, camp in sms_rows:
        entries.append({
            "timestamp": ev.occurred_at.isoformat(),
            "channel": "sms",
            "event_type": ev.type.value,
            "title": f"SMS {ev.type.value.title()}",
            "detail": camp.name,
        })

    # Form submissions
    form_rows = await db.execute(
        select(FormSubmission, LandingPage)
        .join(LandingPage, FormSubmission.landing_page_id == LandingPage.id)
        .where(
            FormSubmission.contact_id == contact_id,
            FormSubmission.organization_id == org_id,
        )
        .order_by(FormSubmission.submitted_at.desc())
    )
    for sub, page in form_rows:
        entries.append({
            "timestamp": sub.submitted_at.isoformat(),
            "channel": "form",
            "event_type": "submitted",
            "title": "Form Submitted",
            "detail": page.title,
        })

    # Workflow enrollments
    wf_rows = await db.execute(
        select(WorkflowEnrollment, Workflow)
        .join(Workflow, WorkflowEnrollment.workflow_id == Workflow.id)
        .where(
            WorkflowEnrollment.contact_id == contact_id,
            WorkflowEnrollment.organization_id == org_id,
        )
        .order_by(WorkflowEnrollment.enrolled_at.desc())
    )
    for enr, wf in wf_rows:
        entries.append({
            "timestamp": enr.enrolled_at.isoformat(),
            "channel": "workflow",
            "event_type": "enrolled",
            "title": "Enrolled in Workflow",
            "detail": wf.name,
        })
        if enr.completed_at:
            entries.append({
                "timestamp": enr.completed_at.isoformat(),
                "channel": "workflow",
                "event_type": "completed",
                "title": "Workflow Completed",
                "detail": wf.name,
            })

    # Notes
    notes = await db.scalars(
        select(ContactNote)
        .where(ContactNote.contact_id == contact_id)
        .order_by(ContactNote.created_at.desc())
    )
    for note in notes:
        entries.append({
            "timestamp": note.created_at.isoformat(),
            "channel": "note",
            "event_type": "note",
            "title": "Note Added",
            "detail": note.content[:120] + ("…" if len(note.content) > 120 else ""),
        })

    # Logged sales activity: stage moves, calls, visits, owner changes, completed tasks
    acts = await db.scalars(
        select(CrmActivity).where(CrmActivity.contact_id == contact_id, CrmActivity.organization_id == org_id)
    )
    labels = {"stage_change": "Stage changed", "call": "Call logged", "visit": "Visit logged",
              "meeting": "Meeting logged", "owner_change": "Owner changed", "task_done": "Task completed"}
    for a in acts:
        entries.append({
            "timestamp": a.created_at.isoformat(),
            "channel": "activity",
            "event_type": a.kind,
            "title": labels.get(a.kind, a.kind.replace("_", " ").title()),
            "detail": a.summary,
        })

    # Customer SMS replies
    replies = await db.scalars(
        select(SmsInboundMessage).where(SmsInboundMessage.contact_id == contact_id, SmsInboundMessage.organization_id == org_id)
    )
    for r in replies:
        entries.append({
            "timestamp": r.received_at.isoformat(),
            "channel": "sms",
            "event_type": "reply",
            "title": "SMS Reply Received",
            "detail": r.body[:160],
        })

    entries.sort(key=lambda e: e["timestamp"], reverse=True)
    return entries


# ---------------------------------------------------------------------------
# Notes CRUD
# ---------------------------------------------------------------------------

async def list_notes(db: AsyncSession, org_id: UUID, contact_id: UUID) -> list[ContactNote]:
    result = await db.scalars(
        select(ContactNote)
        .where(ContactNote.contact_id == contact_id, ContactNote.organization_id == org_id)
        .order_by(ContactNote.created_at.desc())
    )
    return list(result.all())


async def create_note(
    db: AsyncSession, org_id: UUID, contact_id: UUID, content: str
) -> ContactNote:
    note = ContactNote(organization_id=org_id, contact_id=contact_id, content=content)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


async def delete_note(db: AsyncSession, org_id: UUID, note_id: UUID) -> bool:
    note = await db.get(ContactNote, note_id)
    if not note or note.organization_id != org_id:
        return False
    await db.delete(note)
    await db.commit()
    return True
