import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SocialAccountCreate(BaseModel):
    platform: str
    account_name: str = Field(min_length=2, max_length=200)
    page_id: str = ""
    access_token: str = ""


class SocialAccountRead(BaseModel):
    id: uuid.UUID
    platform: str
    account_name: str
    page_id: str
    is_active: bool
    has_token: bool = False
    last_checked_at: datetime | None = None
    last_check_ok: bool | None = None
    last_check_message: str | None = None
    created_at: datetime


class SocialPostCreate(BaseModel):
    social_account_id: uuid.UUID
    content: str = Field(min_length=1, max_length=3000)
    media_url: str | None = None
    scheduled_at: datetime | None = None
    draft: bool = False


class SocialPostUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=3000)
    media_url: str | None = None
    scheduled_at: datetime | None = None
    clear_schedule: bool = False
    draft: bool | None = None


class SocialPostRead(BaseModel):
    id: uuid.UUID
    social_account_id: uuid.UUID
    platform: str
    content: str
    media_url: str | None
    scheduled_at: datetime | None
    published_at: datetime | None
    external_post_id: str | None
    status: str
    likes_count: int
    shares_count: int
    comments_count: int
    error_message: str | None = None
    created_at: datetime
