import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.onboarding import COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS


class OrganizationProfileRead(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str | None
    language: str
    phone: str | None
    website: str | None
    industry: str | None
    company_size: str | None
    contact_email: str | None
    address: str | None
    city: str | None
    country: str | None
    trade_license_no: str | None
    tin: str | None
    created_at: datetime
    # read-only context for the profile page
    owner_email: str | None
    my_email: str
    my_role: str
    my_permissions: list[str] = []
    plan_name: str | None
    member_count: int
    can_edit: bool


class OrganizationProfileUpdate(BaseModel):
    """Every field optional; empty string clears an optional field."""

    name: str | None = Field(default=None, min_length=2, max_length=200)
    display_name: str | None = Field(default=None, max_length=200)
    language: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    website: str | None = Field(default=None, max_length=255)
    industry: INDUSTRY_OPTIONS | None = None
    company_size: COMPANY_SIZE_OPTIONS | None = None
    contact_email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    trade_license_no: str | None = Field(default=None, max_length=60)
    tin: str | None = Field(default=None, max_length=30)

    @field_validator("language")
    @classmethod
    def _lang(cls, v):
        if v is not None and v not in ("bn", "en"):
            raise ValueError("Language must be 'bn' or 'en'")
        return v

    @field_validator("contact_email")
    @classmethod
    def _email(cls, v):
        if v and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v.strip()):
            raise ValueError("Enter a valid contact email")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        if v and not re.match(r"^[0-9+\-()\s]{6,30}$", v.strip()):
            raise ValueError("Enter a valid phone number")
        return v

    @field_validator("website")
    @classmethod
    def _site(cls, v):
        if v and not re.match(r"^(https?://)?[^\s/]+\.[^\s]+$", v.strip()):
            raise ValueError("Enter a valid website, e.g. https://example.com")
        return v
