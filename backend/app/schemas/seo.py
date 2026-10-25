from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, HttpUrl


class AuditCreate(BaseModel):
    url: str


class SeoIssue(BaseModel):
    type: str
    severity: str   # "critical" | "warning" | "info"
    message: str


class SeoPageRead(BaseModel):
    id: UUID
    url: str
    http_status: int
    title: str
    title_length: int
    meta_description: str
    meta_description_length: int
    h1_count: int
    h1_text: str
    canonical_url: str
    has_noindex: bool
    img_without_alt: int
    internal_links_count: int
    broken_links: list[str]
    issues: list[dict[str, Any]]
    crawled_at: datetime
    model_config = ConfigDict(from_attributes=True)

    @property
    def issue_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {"critical": 0, "warning": 0, "info": 0}
        for i in self.issues:
            sev = i.get("severity", "info")
            counts[sev] = counts.get(sev, 0) + 1
        return counts


class SeoAuditRead(BaseModel):
    id: UUID
    organization_id: UUID
    url: str
    status: str
    pages_crawled: int
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    pages: list[SeoPageRead] = []
    model_config = ConfigDict(from_attributes=True)
