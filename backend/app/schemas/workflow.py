import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    trigger_type: str
    trigger_config: dict[str, Any] = {}
    steps: list[dict[str, Any]] = []


class WorkflowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    trigger_type: str | None = None
    trigger_config: dict[str, Any] | None = None
    steps: list[dict[str, Any]] | None = None
    is_active: bool | None = None


class WorkflowRead(BaseModel):
    id: uuid.UUID
    name: str
    trigger_type: str
    trigger_config: dict[str, Any]
    steps: list[dict[str, Any]]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    enrollment_count: int = 0
    active_count: int = 0
    completed_count: int = 0


class StepLogRead(BaseModel):
    step_index: int
    step_type: str
    status: str
    notes: str | None
    executed_at: datetime


class EnrollmentRead(BaseModel):
    id: uuid.UUID
    contact_id: uuid.UUID
    contact_email: str | None = None
    contact_name: str | None = None
    current_step_index: int
    status: str
    enrolled_at: datetime
    completed_at: datetime | None
    error_message: str | None
    step_logs: list[StepLogRead] = []


class ManualTriggerRequest(BaseModel):
    contact_id: uuid.UUID
