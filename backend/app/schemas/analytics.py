import uuid
from typing import Any

from pydantic import BaseModel


class CampaignStat(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    sent_count: int
    opened_count: int
    clicked_count: int
    open_rate: float
    click_rate: float


class OrgAnalytics(BaseModel):
    total_contacts: int
    total_campaigns: int
    sent_campaigns: int
    total_sent: int
    total_opened: int
    total_clicked: int
    open_rate: float
    click_rate: float
    campaigns: list[CampaignStat]


# ---------------------------------------------------------------------------
# Cross-channel analytics (Step 14)
# ---------------------------------------------------------------------------

class EmailChannelSummary(BaseModel):
    campaigns_run: int
    total_sent: int
    total_opened: int
    total_clicked: int
    open_rate: float
    click_rate: float


class SmsChannelSummary(BaseModel):
    campaigns_run: int
    total_sent: int
    total_delivered: int
    total_failed: int
    delivery_rate: float


class SocialChannelSummary(BaseModel):
    posts_published: int
    posts_scheduled: int
    total_likes: int
    total_shares: int
    total_comments: int
    by_platform: dict[str, int]


class ActivityEntry(BaseModel):
    id: str
    name: str
    channel: str          # "email" | "sms" | "social"
    platform: str | None  # social platform or None
    date: str             # ISO timestamp
    metric_a_label: str
    metric_a: Any
    metric_b_label: str
    metric_b: Any
    total_reached: int


class PaidAdsChannelSummary(BaseModel):
    accounts_connected: int
    campaigns_active: int
    total_spend: float
    total_impressions: int
    total_clicks: int
    total_conversions: float
    avg_ctr: float


class CrossChannelAnalytics(BaseModel):
    date_from: str
    date_to: str
    email: EmailChannelSummary
    sms: SmsChannelSummary
    social: SocialChannelSummary
    paid_ads: PaidAdsChannelSummary | None = None
    activity: list[ActivityEntry]
