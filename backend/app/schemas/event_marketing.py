from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    event_date: datetime
    location: str | None = None
    capacity: int | None = None
    workflow_id: uuid.UUID | None = None


class EventRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    title: str
    description: str | None
    event_date: datetime
    location: str | None
    capacity: int | None
    workflow_id: uuid.UUID | None
    created_at: datetime
    registration_count: int = 0

    model_config = {"from_attributes": True}


class RegistrationCreate(BaseModel):
    contact_id: uuid.UUID


class RegistrationRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    contact_id: uuid.UUID
    registered_at: datetime
    attended: bool
    attended_at: datetime | None
    contact_name: str | None = None
    contact_email: str | None = None

    model_config = {"from_attributes": True}
