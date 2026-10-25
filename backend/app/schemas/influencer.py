import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class InfluencerCreate(BaseModel):
    name: str
    handle: str | None = None
    platform: Literal["instagram", "youtube", "tiktok", "facebook", "twitter", "linkedin", "blog", "other"] = "instagram"
    followers: int = 0
    niche: str | None = None
    engagement_rate: float | None = None
    email: str | None = None
    phone: str | None = None
    outreach_status: Literal["new", "contacted", "replied", "agreed", "completed", "rejected"] = "new"
    notes: str | None = None
    contact_id: uuid.UUID | None = None


class InfluencerUpdate(BaseModel):
    name: str | None = None
    handle: str | None = None
    platform: str | None = None
    followers: int | None = None
    niche: str | None = None
    engagement_rate: float | None = None
    email: str | None = None
    phone: str | None = None
    outreach_status: str | None = None
    notes: str | None = None
    contact_id: uuid.UUID | None = None


class InfluencerRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    handle: str | None
    platform: str
    followers: int
    niche: str | None
    engagement_rate: float | None
    email: str | None
    phone: str | None
    outreach_status: str
    notes: str | None
    contact_id: uuid.UUID | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class DeliverableCreate(BaseModel):
    type: Literal["post", "story", "reel", "video", "blog_post", "tweet", "live"] = "post"
    description: str
    due_date: date | None = None
    referral_link_id: uuid.UUID | None = None


class DeliverableUpdate(BaseModel):
    type: str | None = None
    description: str | None = None
    due_date: date | None = None
    status: str | None = None
    referral_link_id: uuid.UUID | None = None


class DeliverableRead(BaseModel):
    id: uuid.UUID
    influencer_id: uuid.UUID
    type: str
    description: str
    due_date: date | None
    status: str
    referral_link_id: uuid.UUID | None
    referral_link_code: str | None
    outcome_clicks: int
    outcome_conversions: int
    submitted_at: datetime | None
    approved_at: datetime | None
    created_at: datetime
