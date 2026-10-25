import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ProgramCreate(BaseModel):
    name: str
    description: str | None = None
    commission_type: Literal["flat", "percentage"] = "percentage"
    commission_value: float = 10.0
    cookie_days: int = 30
    target_url: str
    is_active: bool = True


class ProgramUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    commission_type: Literal["flat", "percentage"] | None = None
    commission_value: float | None = None
    cookie_days: int | None = None
    target_url: str | None = None
    is_active: bool | None = None


class ProgramRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None
    commission_type: str
    commission_value: float
    cookie_days: int
    target_url: str
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LinkCreate(BaseModel):
    contact_id: uuid.UUID | None = None


class LinkRead(BaseModel):
    id: uuid.UUID
    program_id: uuid.UUID
    contact_id: uuid.UUID | None
    code: str
    clicks: int
    conversions: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ConversionCreate(BaseModel):
    code: str
    conversion_value: float = 0.0
    notes: str | None = None


class CommissionRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    program_id: uuid.UUID
    link_id: uuid.UUID
    contact_id: uuid.UUID | None
    click_id: uuid.UUID | None
    commission_amount: float
    conversion_value: float
    status: str
    notes: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CommissionStatusUpdate(BaseModel):
    status: Literal["pending", "approved", "paid", "rejected"]
