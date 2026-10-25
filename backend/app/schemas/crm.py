from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PipelineStageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    position: int | None = None
    color: str = "#6B7280"
    outcome: str = Field(default="open", pattern="^(open|won|lost)$")
    probability: int | None = Field(default=None, ge=0, le=100)
    stale_days: int | None = Field(default=None, ge=1, le=365)
    auto_task_days: int | None = Field(default=None, ge=0, le=365)
    auto_task_title: str | None = Field(default=None, max_length=200)


class PipelineStageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    position: int | None = None
    color: str | None = None
    outcome: str | None = Field(default=None, pattern="^(open|won|lost)$")
    probability: int | None = Field(default=None, ge=0, le=100)      # send null to clear
    stale_days: int | None = Field(default=None, ge=1, le=365)
    auto_task_days: int | None = Field(default=None, ge=0, le=365)
    auto_task_title: str | None = Field(default=None, max_length=200)


class StageReorderRequest(BaseModel):
    ids: list[UUID]


class PipelineStageRead(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    position: int
    color: str
    outcome: str = "open"
    probability: int | None = None
    stale_days: int | None = None
    auto_task_days: int | None = None
    auto_task_title: str | None = None
    lead_count: int = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ContactNoteCreate(BaseModel):
    content: str


class ContactNoteRead(BaseModel):
    id: UUID
    contact_id: UUID
    content: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TimelineEntry(BaseModel):
    timestamp: str
    channel: str
    event_type: str
    title: str
    detail: str | None = None


class KanbanContact(BaseModel):
    id: UUID
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None
    whatsapp_number: str | None = None
    company: str | None = None
    city: str | None = None
    district: str | None = None
    area: str | None = None
    source: str | None = None
    tags: list[str]
    lead_score: int
    pipeline_stage_id: UUID | None
    owner_user_id: UUID | None = None
    deal_value: int | None = None
    expected_close_date: str | None = None
    stage_changed_at: str | None = None
    next_task_due: str | None = None


class KanbanColumn(BaseModel):
    id: UUID | None
    name: str
    position: int
    color: str
    outcome: str = "open"
    probability: int | None = None
    stale_days: int | None = None
    total: int = 0
    value_total: int = 0
    contacts: list[KanbanContact]


class CrmContactRead(BaseModel):
    id: UUID
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None
    tags: list[str]
    sms_opt_in: bool
    whatsapp_opt_in: bool
    pipeline_stage_id: UUID | None
    lead_score: int
    created_at: datetime
    updated_at: datetime
    company: str | None = None
    address: str | None = None
    city: str | None = None
    division: str | None = None
    district: str | None = None
    area: str | None = None
    source: str | None = None
    whatsapp_number: str | None = None
    facebook_url: str | None = None
    customer_type: str | None = None
    last_contacted_at: datetime | None = None
    owner_user_id: UUID | None = None
    deal_value: int | None = None
    expected_close_date: date | None = None
    lost_reason: str | None = None
    stage_changed_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    custom_fields: dict = {}
    model_config = ConfigDict(from_attributes=True)


class StageUpdateRequest(BaseModel):
    stage_id: UUID | None = None
    lost_reason: str | None = Field(default=None, max_length=300)


class ProfileUpdate(BaseModel):
    company: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    division: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    area: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=60)
    whatsapp_number: str | None = Field(default=None, max_length=32)
    facebook_url: str | None = Field(default=None, max_length=300)
    customer_type: str | None = Field(default=None, pattern="^(retail|wholesale)?$")
    deal_value: float | None = Field(default=None, ge=0)         # taka
    expected_close_date: date | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    custom_fields: dict | None = None


class OwnerRequest(BaseModel):
    user_id: UUID | None = None


class ActivityCreate(BaseModel):
    kind: str
    summary: str = Field(default="", max_length=500)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    due_at: datetime
    kind: str = "follow_up"
    assignee_user_id: UUID | None = None
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")
    description: str | None = Field(default=None, max_length=2000)
    contact_id: UUID | None = None          # only used by POST /crm/tasks (general team tasks)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    due_at: datetime | None = None
    done: bool | None = None
    assignee_user_id: UUID | None = None    # send null to unassign; omit to leave unchanged
    priority: str | None = Field(default=None, pattern="^(low|normal|high)$")
    description: str | None = Field(default=None, max_length=2000)


class TaskRead(BaseModel):
    id: UUID
    contact_id: UUID | None = None
    contact_name: str = ""
    contact_phone: str | None = None
    title: str
    kind: str
    due_at: datetime
    done_at: datetime | None
    assignee_user_id: UUID | None
    created_by_user_id: UUID | None = None
    priority: str = "normal"
    description: str | None = None
    overdue: bool = False


class CustomFieldCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    field_type: str = "text"
    options: list[str] = []


class CustomFieldRead(BaseModel):
    id: UUID
    key: str
    label: str
    field_type: str
    options: list[str]
    model_config = ConfigDict(from_attributes=True)


class DueCreate(BaseModel):
    kind: str = Field(pattern="^(due|payment)$")
    amount: float = Field(gt=0)             # taka
    note: str | None = Field(default=None, max_length=300)
    due_date: date | None = None


class DueRead(BaseModel):
    id: UUID
    kind: str
    amount: int
    note: str | None
    due_date: date | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SourceItem(BaseModel):
    key: str | None = None
    label: str = Field(min_length=1, max_length=40)


class BoardPrefs(BaseModel):
    show_value: bool = True
    show_company: bool = True
    show_source: bool = True
    show_due: bool = True
    stale_highlight: bool = True
    sort: str = Field(default="recent", pattern="^(recent|value|waiting)$")


class CrmSettingsRead(BaseModel):
    round_robin: bool
    task_reminders: bool
    lost_reasons: list[str] = []
    sources: list[SourceItem] = []
    board_prefs: BoardPrefs = BoardPrefs()


class CrmSettingsUpdate(BaseModel):
    round_robin: bool | None = None
    task_reminders: bool | None = None
    lost_reasons: list[str] | None = None
    sources: list[SourceItem] | None = None
    board_prefs: dict | None = None


class CustomFieldUpdate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    options: list[str] = []
