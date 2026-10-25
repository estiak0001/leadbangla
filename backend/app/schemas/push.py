import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class PushConfigRead(BaseModel):
    ready: bool                      # can this customer send push right now?
    vapid_public_key: str | None     # the key browsers subscribe with
    site_key: str                    # identifies the customer on their website / subscribe link
    subscribers: int
    last_7_days: int
    linked: int                      # subscribers matched to a contact


class PushTokenRegister(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str | None = None
    contact_id: uuid.UUID | None = None


class PushTokenRead(BaseModel):
    id: uuid.UUID
    endpoint: str
    contact_id: uuid.UUID | None
    source: str = "dashboard"
    email: str | None = None
    user_agent: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PushCampaignCreate(BaseModel):
    title: str
    body: str
    icon_url: str | None = None
    click_url: str | None = None
    segment_id: uuid.UUID | None = None


class PushCampaignRead(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    icon_url: str | None
    click_url: str | None
    segment_id: uuid.UUID | None
    provider: str
    status: str
    sent_count: int
    failed_count: int
    error_message: str | None
    created_at: datetime
    sent_at: datetime | None
    model_config = ConfigDict(from_attributes=True)
