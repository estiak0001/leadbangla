import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WaTemplate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    language: str = Field(default="en", max_length=16)
    params: list[str] = Field(default_factory=list, max_length=10)   # text for {{1}}, {{2}}… (merge tags allowed)


class SmsCampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    segment_id: uuid.UUID
    channel: str = "sms"
    message_body: str = Field(min_length=1, max_length=1600)
    # None falls back to the org's default masking sender ID, then the
    # platform default — see sms_service.create_sms_campaign.
    sender_id: str | None = Field(default=None, max_length=20)
    wa_template: WaTemplate | None = None


class SmsCampaignRead(BaseModel):
    id: uuid.UUID
    name: str
    channel: str
    status: str
    segment_id: uuid.UUID | None
    sender_id: str
    message_body: str
    wa_template: dict | None = None
    sent_at: datetime | None
    created_at: datetime
    sent_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0


class OptInUpdate(BaseModel):
    sms_opt_in: bool | None = None
    whatsapp_opt_in: bool | None = None


class OrgSmsSettingsRead(BaseModel):
    sms_sender_id: str | None
    # Per-org default derived from the org name — shown as a hint when
    # sms_sender_id hasn't been explicitly set/saved yet.
    suggested_sender_id: str
    # True once platform staff have confirmed BTRC/aggregator approval for
    # sms_sender_id — until then, live sends use the platform default.
    approved: bool
    # One-time fee (BDT) charged when requesting a new/changed Sender ID.
    setup_fee_bdt: float


class OrgSmsSettingsUpdate(BaseModel):
    sms_sender_id: str | None = Field(default=None, max_length=20)


class SmsEventRead(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    campaign_name: str
    phone: str
    type: str
    gateway_message_id: str | None
    error: str | None = None
    occurred_at: datetime


class SmsSkipEventRead(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    campaign_name: str
    phone: str
    occurred_at: datetime


class SmsCampaignEventsRead(BaseModel):
    sent_and_failed: list[SmsEventRead]
    skipped: list[SmsSkipEventRead]


class SmsInboundRead(BaseModel):
    id: uuid.UUID
    from_phone: str
    to_sender_id: str | None
    body: str
    contact_id: uuid.UUID | None
    contact_name: str | None
    received_at: datetime


class SmsDashboardRead(BaseModel):
    total_campaigns: int
    campaigns_by_status: dict[str, int]
    total_sent: int
    total_failed: int
    total_skipped: int
    total_inbound: int
    sms_credits_spent_bdt: float
    whatsapp_credits_spent_bdt: float
    sender_id: str | None
    sender_id_approved: bool
