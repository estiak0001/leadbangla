from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.contact import Contact
from app.models.crm import CrmTask
from app.models.enums import TenantRole
from app.schemas.crm import (
    ActivityCreate, ContactNoteCreate, ContactNoteRead, CrmContactRead, CrmSettingsRead, CrmSettingsUpdate,
    CustomFieldCreate, CustomFieldRead, CustomFieldUpdate, DueCreate, DueRead, KanbanColumn, KanbanContact, OwnerRequest,
    PipelineStageCreate, PipelineStageRead, PipelineStageUpdate, ProfileUpdate, StageReorderRequest,
    StageUpdateRequest, TaskCreate, TaskRead, TaskUpdate, TimelineEntry,
)
from app.services import contact_message_service as messaging
from app.services import crm_sales_service as sales
from app.services import crm_service

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Access helpers
# ---------------------------------------------------------------------------

def _scope(membership) -> UUID | None:
    """Restricted sales role sees only its own leads."""
    return membership.user_id if membership.role == TenantRole.SALES else None


def _require_manager(membership) -> None:
    if membership.role not in (TenantRole.OWNER, TenantRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners and admins can change CRM settings")


async def _get_contact(db: AsyncSession, membership, contact_id: UUID, *, allow_deleted: bool = False) -> Contact:
    contact = await db.get(Contact, contact_id)
    if (
        not contact or contact.organization_id != membership.organization_id
        or (contact.deleted_at is not None and not allow_deleted)
        or (membership.role == TenantRole.SALES and contact.owner_user_id != membership.user_id)
    ):
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


async def _crm_contact(db: AsyncSession, org_id: UUID, contact: Contact) -> CrmContactRead:
    score = await crm_service.calculate_lead_score(db, org_id, contact)
    return CrmContactRead.model_validate({**{c.name: getattr(contact, c.name) for c in Contact.__table__.columns},
                                          "tags": contact.tags or [], "custom_fields": contact.custom_fields or {},
                                          "lead_score": score})


def _bad(e: Exception):
    raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Settings, team, sources
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=CrmSettingsRead)
async def get_settings(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return crm_service.settings_view(await crm_service.ensure_initialized(db, membership.organization_id))


@router.put("/settings", response_model=CrmSettingsRead)
async def put_settings(body: CrmSettingsUpdate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    data = body.model_dump(exclude_unset=True)
    if data.get("sources") is not None:
        data["sources"] = [{"key": s.get("key"), "label": s["label"]} for s in data["sources"]]
    try:
        return crm_service.settings_view(await crm_service.update_settings(db, membership.organization_id, **data))
    except crm_service.SettingsError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/team")
async def team(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await crm_service.list_team(db, membership.organization_id)


@router.get("/sources")
async def sources(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await crm_service.list_sources(db, membership.organization_id)


# ---------------------------------------------------------------------------
# Pipeline stage management
# ---------------------------------------------------------------------------

@router.get("/stages", response_model=list[PipelineStageRead])
async def list_stages(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    counts = await crm_service.stage_lead_counts(db, membership.organization_id)
    return [PipelineStageRead.model_validate(s).model_copy(update={"lead_count": counts.get(s.id, 0)}) for s in await crm_service.list_stages(db, membership.organization_id)]


@router.post("/stages", response_model=PipelineStageRead, status_code=201)
async def create_stage(body: PipelineStageCreate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    try:
        return await crm_service.create_stage(
            db, membership.organization_id, body.name, body.position, body.color, body.outcome,
            probability=body.probability, stale_days=body.stale_days, auto_task_days=body.auto_task_days, auto_task_title=body.auto_task_title)
    except crm_service.SettingsError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/stages/reorder", response_model=list[PipelineStageRead])
async def reorder_stages(body: StageReorderRequest, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    return await crm_service.reorder_stages(db, membership.organization_id, body.ids)


@router.put("/stages/{stage_id}", response_model=PipelineStageRead)
async def update_stage(stage_id: UUID, body: PipelineStageUpdate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    extras = {k: getattr(body, k) for k in ("probability", "stale_days", "auto_task_days", "auto_task_title") if k in body.model_fields_set}
    try:
        stage = await crm_service.update_stage(
            db, membership.organization_id, stage_id,
            name=body.name, position=body.position, color=body.color, outcome=body.outcome, **extras,
        )
    except crm_service.SettingsError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    return stage


@router.delete("/stages/{stage_id}", status_code=204)
async def delete_stage(stage_id: UUID, move_to: UUID | None = None, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    if not await crm_service.delete_stage(db, membership.organization_id, stage_id, move_to):
        raise HTTPException(status_code=404, detail="Stage not found")


# ---------------------------------------------------------------------------
# Kanban board (paged per column)
# ---------------------------------------------------------------------------

@router.get("/pipeline", response_model=list[KanbanColumn])
async def get_pipeline(
    owner: str | None = Query(default=None, description="'me', 'unassigned' or a user id"),
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    sort: str | None = Query(default=None, pattern="^(recent|value|waiting)$"),
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    owner = str(membership.user_id) if owner == "me" else owner
    try:
        return await crm_service.get_pipeline_board(
            db, membership.organization_id, owner=owner, q=q, limit=limit, scope_owner=_scope(membership), sort=sort)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid owner filter")


@router.get("/pipeline/columns/{stage_id}", response_model=list[KanbanContact])
async def column_more(
    stage_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    owner: str | None = None,
    q: str | None = None,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    owner = str(membership.user_id) if owner == "me" else owner
    sid = None if stage_id == "unassigned" else UUID(stage_id)
    return await crm_service.get_column_contacts(
        db, membership.organization_id, sid, offset=offset, limit=limit, owner=owner, q=q, scope_owner=_scope(membership))


# ---------------------------------------------------------------------------
# Contact CRM detail
# ---------------------------------------------------------------------------

@router.get("/contacts/{contact_id}", response_model=CrmContactRead)
async def get_crm_contact(contact_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    contact = await _get_contact(db, membership, contact_id)
    return await _crm_contact(db, membership.organization_id, contact)


@router.patch("/contacts/{contact_id}/stage", response_model=CrmContactRead)
async def update_contact_stage(
    contact_id: UUID, body: StageUpdateRequest, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db),
):
    await _get_contact(db, membership, contact_id)
    contact = await crm_service.set_contact_stage(
        db, membership.organization_id, contact_id, body.stage_id, user_id=membership.user_id, lost_reason=body.lost_reason)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact or stage not found")
    return await _crm_contact(db, membership.organization_id, contact)


@router.patch("/contacts/{contact_id}/profile", response_model=CrmContactRead)
async def update_profile(
    contact_id: UUID, body: ProfileUpdate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db),
):
    await _get_contact(db, membership, contact_id)
    try:
        contact = await sales.update_profile(
            db, membership.organization_id, contact_id, body.model_dump(exclude_unset=True), membership.user_id)
    except sales.CrmError as e:
        _bad(e)
    return await _crm_contact(db, membership.organization_id, contact)


@router.patch("/contacts/{contact_id}/owner", response_model=CrmContactRead)
async def set_owner(contact_id: UUID, body: OwnerRequest, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    if membership.role == TenantRole.SALES:
        _require_manager(membership)
    try:
        contact = await sales.set_owner(db, membership.organization_id, contact_id, body.user_id, membership.user_id)
    except sales.CrmError as e:
        _bad(e)
    return await _crm_contact(db, membership.organization_id, contact)


@router.post("/contacts/{contact_id}/activities", status_code=201)
async def log_activity(contact_id: UUID, body: ActivityCreate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    try:
        a = await sales.log_contact_activity(db, membership.organization_id, contact_id, body.kind, body.summary, membership.user_id)
    except sales.CrmError as e:
        _bad(e)
    return {"id": a.id, "kind": a.kind, "summary": a.summary, "created_at": a.created_at}


class DirectEmailRequest(BaseModel):
    sender_id: UUID
    subject: str = Field(min_length=1, max_length=200)
    body_html: str = Field(min_length=1, max_length=50000)


class DirectSmsRequest(BaseModel):
    body: str = Field(min_length=1, max_length=640)


@router.post("/contacts/{contact_id}/send-email", status_code=status.HTTP_204_NO_CONTENT)
async def send_contact_email(contact_id: UUID, body: DirectEmailRequest, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    try:
        await messaging.send_direct_email(db, membership.organization_id, contact_id, body.sender_id, body.subject, body.body_html, membership.user_id)
    except messaging.ContactMessageError as e:
        _bad(e)


@router.post("/contacts/{contact_id}/send-sms", status_code=status.HTTP_204_NO_CONTENT)
async def send_contact_sms(contact_id: UUID, body: DirectSmsRequest, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    try:
        await messaging.send_direct_sms(db, membership.organization_id, contact_id, body.body, membership.user_id)
    except messaging.ContactMessageError as e:
        _bad(e)


@router.get("/contacts/{contact_id}/timeline", response_model=list[TimelineEntry])
async def get_timeline(contact_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id, allow_deleted=True)
    entries = await crm_service.get_contact_timeline(db, membership.organization_id, contact_id)
    return [TimelineEntry(**e) for e in entries]


@router.get("/contacts/{contact_id}/consent")
async def consent(contact_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id, allow_deleted=True)
    return await sales.list_consent(db, membership.organization_id, contact_id)


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------

@router.get("/contacts/{contact_id}/notes", response_model=list[ContactNoteRead])
async def list_notes(contact_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id, allow_deleted=True)
    return await crm_service.list_notes(db, membership.organization_id, contact_id)


@router.post("/contacts/{contact_id}/notes", response_model=ContactNoteRead, status_code=201)
async def create_note(contact_id: UUID, body: ContactNoteCreate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    return await crm_service.create_note(db, membership.organization_id, contact_id, body.content)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    if not await crm_service.delete_note(db, membership.organization_id, note_id):
        raise HTTPException(status_code=404, detail="Note not found")


# ---------------------------------------------------------------------------
# Tasks / follow-ups
# ---------------------------------------------------------------------------

@router.get("/tasks", response_model=list[TaskRead])
async def list_tasks(
    scope: str = Query(default="open", pattern="^(open|overdue|today|upcoming|done)$"),
    mine: bool = False,
    assignee: UUID | None = None,
    assigned_by_me: bool = False,
    unassigned: bool = False,
    tz_offset: int = Query(default=360, ge=-840, le=840),
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    restricted = _scope(membership)
    who = restricted or (membership.user_id if mine else assignee)
    return await sales.list_tasks(
        db, membership.organization_id, scope=scope, assignee=who, tz_offset_minutes=tz_offset,
        assigned_by=membership.user_id if assigned_by_me else None, unassigned=unassigned and restricted is None)


@router.post("/tasks", response_model=TaskRead, status_code=201)
async def create_general_task(body: TaskCreate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    """A task for a teammate, optionally tied to a lead."""
    if body.contact_id:
        await _get_contact(db, membership, body.contact_id)
    if body.assignee_user_id and body.assignee_user_id != membership.user_id and membership.role == TenantRole.SALES:
        raise HTTPException(status_code=403, detail="Your role can only create tasks for yourself")
    try:
        t = await sales.create_task(
            db, membership.organization_id, body.contact_id, title=body.title, due_at=body.due_at, kind=body.kind,
            assignee_user_id=body.assignee_user_id, created_by=membership.user_id, priority=body.priority, description=body.description)
    except sales.CrmError as e:
        _bad(e)
    contact = await db.get(Contact, t.contact_id) if t.contact_id else None
    return sales._task_dict(t, contact, datetime.now(timezone.utc))


@router.get("/tasks/counts")
async def task_counts(
    mine: bool = False, tz_offset: int = Query(default=360, ge=-840, le=840),
    membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db),
):
    assignee = _scope(membership) or (membership.user_id if mine else None)
    return await sales.task_counts(db, membership.organization_id, assignee, tz_offset)


@router.get("/contacts/{contact_id}/tasks", response_model=list[TaskRead])
async def contact_tasks(contact_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    open_ = await sales.list_tasks(db, membership.organization_id, scope="open", contact_id=contact_id)
    done = await sales.list_tasks(db, membership.organization_id, scope="done", contact_id=contact_id)
    return open_ + done[:5]


@router.post("/contacts/{contact_id}/tasks", response_model=TaskRead, status_code=201)
async def create_task(contact_id: UUID, body: TaskCreate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    try:
        t = await sales.create_task(
            db, membership.organization_id, contact_id, title=body.title, due_at=body.due_at, kind=body.kind,
            assignee_user_id=body.assignee_user_id, created_by=membership.user_id,
            priority=body.priority, description=body.description)
    except sales.CrmError as e:
        _bad(e)
    return sales._task_dict(t, await db.get(Contact, contact_id), datetime.now(timezone.utc))


@router.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(task_id: UUID, body: TaskUpdate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    fields = body.model_fields_set
    if membership.role == TenantRole.SALES:
        existing = await db.get(CrmTask, task_id)
        if not existing or existing.organization_id != membership.organization_id or existing.assignee_user_id != membership.user_id:
            raise HTTPException(status_code=404, detail="Task not found")
        if "assignee_user_id" in fields and body.assignee_user_id not in (None, membership.user_id):
            raise HTTPException(status_code=403, detail="Your role can't hand tasks to other people")
    try:
        t = await sales.update_task(
            db, membership.organization_id, task_id, done=body.done, due_at=body.due_at, title=body.title, user_id=membership.user_id,
            assignee=body.assignee_user_id if "assignee_user_id" in fields else sales._UNSET,
            priority=body.priority, description=body.description)
    except sales.CrmError as e:
        raise HTTPException(status_code=400 if "team" in str(e) else 404, detail=str(e))
    contact = await db.get(Contact, t.contact_id) if t.contact_id else None
    return sales._task_dict(t, contact, datetime.now(timezone.utc))


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


async def _task_visible(db: AsyncSession, membership, task_id: UUID) -> None:
    t = await db.get(CrmTask, task_id)
    if not t or t.organization_id != membership.organization_id or (
        membership.role == TenantRole.SALES and t.assignee_user_id != membership.user_id
    ):
        raise HTTPException(status_code=404, detail="Task not found")


@router.get("/tasks/{task_id}/comments")
async def task_comments(task_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _task_visible(db, membership, task_id)
    return await sales.list_task_comments(db, membership.organization_id, task_id)


@router.post("/tasks/{task_id}/comments", status_code=201)
async def add_task_comment(task_id: UUID, body: CommentBody, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _task_visible(db, membership, task_id)
    try:
        return await sales.add_task_comment(db, membership.organization_id, task_id, membership.user_id, body.body)
    except sales.CrmError as e:
        _bad(e)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    if not await sales.delete_task(db, membership.organization_id, task_id):
        raise HTTPException(status_code=404, detail="Task not found")


# ---------------------------------------------------------------------------
# Custom fields
# ---------------------------------------------------------------------------

@router.get("/custom-fields", response_model=list[CustomFieldRead])
async def custom_fields(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await sales.list_custom_fields(db, membership.organization_id)


@router.post("/custom-fields", response_model=CustomFieldRead, status_code=201)
async def add_custom_field(body: CustomFieldCreate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    try:
        return await sales.create_custom_field(db, membership.organization_id, body.label, body.field_type, body.options)
    except sales.CrmError as e:
        _bad(e)


@router.put("/custom-fields/{field_id}", response_model=CustomFieldRead)
async def edit_custom_field(field_id: UUID, body: CustomFieldUpdate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    try:
        return await sales.update_custom_field(db, membership.organization_id, field_id, body.label, body.options)
    except sales.CrmError as e:
        _bad(e)


@router.put("/custom-fields-order", response_model=list[CustomFieldRead])
async def order_custom_fields(body: StageReorderRequest, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    return await sales.reorder_custom_fields(db, membership.organization_id, body.ids)


@router.delete("/custom-fields/{field_id}", status_code=204)
async def remove_custom_field(field_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    _require_manager(membership)
    if not await sales.delete_custom_field(db, membership.organization_id, field_id):
        raise HTTPException(status_code=404, detail="Field not found")


# ---------------------------------------------------------------------------
# Baki / dues
# ---------------------------------------------------------------------------

@router.get("/dues")
async def dues_overview(membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await sales.dues_overview(db, membership.organization_id, _scope(membership))


@router.get("/contacts/{contact_id}/dues")
async def contact_dues(contact_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    data = await sales.contact_dues(db, membership.organization_id, contact_id)
    return {"balance": data["balance"], "entries": [DueRead.model_validate(e) for e in data["entries"]]}


@router.post("/contacts/{contact_id}/dues", response_model=DueRead, status_code=201)
async def add_due(contact_id: UUID, body: DueCreate, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await _get_contact(db, membership, contact_id)
    try:
        return await sales.add_due_entry(
            db, membership.organization_id, contact_id, kind=body.kind, amount_taka=body.amount,
            note=body.note, due_date=body.due_date, user_id=membership.user_id)
    except sales.CrmError as e:
        _bad(e)


@router.delete("/dues/{entry_id}", status_code=204)
async def delete_due(entry_id: UUID, membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    if not await sales.delete_due_entry(db, membership.organization_id, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@router.get("/team-activity")
async def team_activity(
    days: int = Query(default=30, ge=1, le=365), user: UUID | None = None,
    kind: str | None = Query(default=None, pattern="^(call|visit|meeting|stage_change|task_done|owner_change)$"),
    membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db),
):
    # Owners and admins see the whole team; everyone else sees only their own work.
    only = None if membership.role in (TenantRole.OWNER, TenantRole.ADMIN) else membership.user_id
    return await sales.team_activity(db, membership.organization_id, days, user, kind, only_user=only)


@router.get("/reports")
async def reports(days: int = Query(default=30, ge=1, le=365), membership=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await sales.reports(db, membership.organization_id, days, _scope(membership))
