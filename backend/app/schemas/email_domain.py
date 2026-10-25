import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DnsRecordRead(BaseModel):
    type: str
    host: str
    data: str
    purpose: str
    required: bool = True
    verified: bool = False


class SendingDomainRead(BaseModel):
    id: uuid.UUID
    domain: str
    provider: str
    status: str
    dns_records: list[DnsRecordRead]
    verified_at: datetime | None
    paused_reason: str | None
    status_note: str | None = None
    dns_submitted_at: datetime | None = None
    last_checked_at: datetime | None = None
    deleted_at: datetime | None = None
    created_at: datetime


class EmailProviderInfo(BaseModel):
    kind: str  # ses | smtp | none
    label: str
    configured: bool
    message: str
    region: str | None = None


class SendingDomainUpdate(BaseModel):
    domain: str = Field(min_length=3, max_length=255)


class SendingDomainCreate(BaseModel):
    domain: str = Field(min_length=3, max_length=255)


class SenderAddressRead(BaseModel):
    id: uuid.UUID
    domain_id: uuid.UUID
    email: str
    name: str | None
    is_default: bool
    created_at: datetime


class SenderAddressCreate(BaseModel):
    domain_id: uuid.UUID
    email: str = Field(min_length=3, max_length=255)
    name: str | None = Field(default=None, max_length=120)


class TestEmailRequest(BaseModel):
    to_email: str


class TestEmailResult(BaseModel):
    ok: bool
    message_id: str
