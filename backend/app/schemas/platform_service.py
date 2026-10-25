import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PlatformServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    category: str
    description: str | None
    docs_url: str | None
    cost_model: str | None
    est_monthly_usd: float
    is_enabled: bool
    is_live: bool
    has_credentials: bool
    last_tested_at: datetime | None
    last_test_ok: bool | None
    last_test_error: str | None


class PlatformServiceUpdate(BaseModel):
    credentials: dict[str, str] | None = None
    is_enabled: bool | None = None
    is_live: bool | None = None
    est_monthly_usd: float | None = None


class IntegrationTestResult(BaseModel):
    ok: bool
    message: str
    tested_at: datetime | None


class PlatformStatusItem(BaseModel):
    category: str
    name: str
    status: str  # "live" | "sandbox" | "disabled"
    note: str | None
