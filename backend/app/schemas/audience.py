import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SegmentMatchType = Literal["all", "any"]


class SegmentRule(BaseModel):
    field: str
    operator: str
    value: str | None = None
    value2: str | None = None            # second value for "between"
    values: list[str] | None = None      # for "is any of", "has any of / all of"

    @model_validator(mode="after")
    def check_rule(self) -> "SegmentRule":
        from app.services.segment_rules import validate_rule  # noqa: PLC0415

        validate_rule(self.field, self.operator, self.value, self.value2, self.values)
        return self


class ContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None
    phone: str | None
    first_name: str | None
    last_name: str | None
    tags: list[str]
    sms_opt_in: bool = False
    whatsapp_opt_in: bool = False
    company: str | None = None
    city: str | None = None
    division: str | None = None
    district: str | None = None
    area: str | None = None
    source: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    owner_user_id: uuid.UUID | None = None
    pipeline_stage_id: uuid.UUID | None = None
    created_at: datetime
    deleted_at: datetime | None = None


class ContactCreate(BaseModel):
    email: str | None = None
    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    tags: list[str] = []
    company: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    division: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    area: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=60)
    whatsapp_number: str | None = Field(default=None, max_length=32)
    facebook_url: str | None = Field(default=None, max_length=300)
    customer_type: str | None = Field(default=None, pattern="^(retail|wholesale)?$")
    sms_opt_in: bool = False
    whatsapp_opt_in: bool = False
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    owner_user_id: uuid.UUID | None = None
    deal_value: float | None = Field(default=None, ge=0)          # taka
    expected_close_date: date | None = None
    custom_fields: dict | None = None


class ContactUpdate(BaseModel):
    email: str | None = None
    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    tags: list[str] | None = None


class ContactBulkDeleteRequest(BaseModel):
    contact_ids: list[uuid.UUID] = Field(min_length=1)


class ContactDeleteByTagRequest(BaseModel):
    tag: str = Field(min_length=1)


class ContactImportError(BaseModel):
    row: int
    reason: str
    value: str = ""


class ContactImportResult(BaseModel):
    created: int
    updated: int
    restored: int = 0                     # contacts that were in Trash and came back
    skipped: int
    total_rows: int
    blocked: int = 0                      # new contacts not added because the plan limit was reached
    limit: int | None = None
    errors: list[ContactImportError] = []
    ignored_columns: list[str] = []
    recognised_columns: list[str] = []
    sms_opted_in: int = 0
    whatsapp_opted_in: int = 0


class BulkDeleteResult(BaseModel):
    deleted: int


class ContactHistoryRead(BaseModel):
    id: uuid.UUID
    action: Literal["created", "updated", "deleted", "restored", "reverted"]
    changes: dict[str, dict[str, str | list[str] | None]]
    changed_by_user_id: uuid.UUID | None
    changed_by_email: str | None
    source_history_id: uuid.UUID | None
    created_at: datetime


class TagPresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class TagPresetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime


class SegmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=300)
    rules: list[SegmentRule] = Field(min_length=1, max_length=20)
    match_type: SegmentMatchType = "all"


class SegmentPreviewRequest(BaseModel):
    rules: list[SegmentRule] = Field(min_length=1, max_length=20)
    match_type: SegmentMatchType = "all"


class SegmentReach(BaseModel):
    """Of the people in a segment, how many can actually be reached on each channel."""
    total: int = 0
    email: int = 0
    phone: int = 0
    sms: int = 0          # has a number AND agreed to SMS
    whatsapp: int = 0     # has a number AND agreed to WhatsApp
    located: int = 0      # has a map pin


class SegmentRead(BaseModel):
    id: uuid.UUID
    name: str
    rules: list[SegmentRule]
    match_type: SegmentMatchType
    created_at: datetime
    contact_count: int
    description: str | None = None
    updated_at: datetime | None = None
    reach: SegmentReach | None = None
    used_in: int = 0      # campaigns using this segment
    is_template: bool = False
    deleted_at: datetime | None = None
