from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AccountCreate(BaseModel):
    platform: str  # "google" | "meta"
    label: str
    credentials: dict


class AccountRead(BaseModel):
    id: uuid.UUID
    platform: str
    label: str
    is_connected: bool
    last_synced_at: datetime | None
    created_at: datetime
    # Never expose raw credentials in read schema

    model_config = {"from_attributes": True}


class CampaignCreate(BaseModel):
    account_id: uuid.UUID
    name: str
    objective: str | None = None
    daily_budget: float
    currency: str = "USD"
    start_date: date | None = None
    end_date: date | None = None


class CampaignRead(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    platform: str
    external_id: str
    name: str
    objective: str | None
    daily_budget: float
    currency: str
    status: str
    start_date: date | None
    end_date: date | None
    created_at: datetime
    synced_at: datetime | None
    total_spend: float = 0.0
    total_impressions: int = 0
    total_clicks: int = 0

    model_config = {"from_attributes": True}


class SpendRecordRead(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    date: date
    spend: float
    impressions: int
    clicks: int
    conversions: float
    synced_at: datetime

    model_config = {"from_attributes": True}


class SyncResult(BaseModel):
    campaign_id: uuid.UUID
    records_upserted: int
    error: str | None = None
