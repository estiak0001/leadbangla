import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    segment_id: uuid.UUID
    subject: str = Field(min_length=1, max_length=200)
    html_body: str = Field(min_length=1)
    sender_id: uuid.UUID | None = None
    reply_to: str | None = Field(default=None, max_length=255)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    segment_id: uuid.UUID | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    html_body: str | None = Field(default=None, min_length=1)
    sender_id: uuid.UUID | None = None
    reply_to: str | None = Field(default=None, max_length=255)


class CampaignHistoryRead(BaseModel):
    id: uuid.UUID
    action: str
    changes: dict
    changed_by_user_id: uuid.UUID | None
    changed_by_email: str | None
    source_history_id: uuid.UUID | None
    created_at: datetime


class CampaignRead(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    subject: str | None
    html_body: str | None
    segment_id: uuid.UUID | None
    sender_id: uuid.UUID | None = None
    reply_to: str | None = None
    sent_at: datetime | None
    deleted_at: datetime | None = None
    created_at: datetime
    sent_count: int = 0
    opened_count: int = 0
    clicked_count: int = 0
    failed_count: int = 0
    total_recipients: int | None = None


class EmailConnectionStatus(BaseModel):
    connection_ok: bool
    connection_note: str


class CampaignPrecheck(BaseModel):
    recipient_count: int
    free_remaining: int
    billable_count: int
    rate_bdt_per_1000: float | None
    estimated_cost_bdt: float
    wallet_balance_bdt: float
    sufficient_balance: bool
    connection_ok: bool
    connection_note: str
    from_email: str | None = None
    sender_warning: str | None = None
    daily_remaining: int | None = None


class CampaignEventEntry(BaseModel):
    contact_id: uuid.UUID
    email: str | None
    status: str
    error: str | None
    occurred_at: datetime


class CampaignEventsResult(BaseModel):
    sent: list[CampaignEventEntry]
    failed: list[CampaignEventEntry]
