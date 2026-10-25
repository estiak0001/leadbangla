import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class LandingPageCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    blocks: list[dict[str, Any]] = []


class LandingPageUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    blocks: list[dict[str, Any]] | None = None
    is_published: bool | None = None


class LandingPageRead(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    blocks: list[dict[str, Any]]
    is_published: bool
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    submission_count: int = 0


class FormSubmitRequest(BaseModel):
    fields: dict[str, str]


class FormSubmitResponse(BaseModel):
    success: bool
    message: str
