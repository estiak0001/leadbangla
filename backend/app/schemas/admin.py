import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.onboarding import COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS


class TenantMemberRead(BaseModel):
    user_id: uuid.UUID
    email: str
    role: str
    joined_at: datetime


class TenantListItem(BaseModel):
    id: uuid.UUID
    name: str
    language: str
    created_at: datetime
    owner_email: str | None
    plan_name: str | None
    subscription_status: str | None
    member_count: int
    phone: str | None
    website: str | None
    industry: str | None
    company_size: str | None
    is_suspended: bool = False


class TenantDetail(TenantListItem):
    display_name: str | None = None
    contact_email: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    trade_license_no: str | None = None
    tin: str | None = None
    internal_notes: str | None = None
    suspended_reason: str | None = None
    wallet_balance_bdt: float = 0
    members: list[TenantMemberRead]
    sms_sender_id: str | None = None
    sms_sender_id_suggested: str = ""
    sms_sender_id_approved: bool = False


class AdminSmsSenderUpdate(BaseModel):
    sender_id: str | None = Field(default=None, max_length=20)
    approved: bool = False


class AdminTenantCreateRequest(BaseModel):
    org_name: str
    language: str = "en"
    phone: str
    industry: INDUSTRY_OPTIONS
    company_size: COMPANY_SIZE_OPTIONS
    website: str | None = None
    owner_email: EmailStr
    plan_id: uuid.UUID | None = None
    # Optional extras captured while onboarding by phone / in person
    display_name: str | None = Field(default=None, max_length=200)
    contact_email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    trade_license_no: str | None = Field(default=None, max_length=60)
    tin: str | None = Field(default=None, max_length=30)
    internal_notes: str | None = Field(default=None, max_length=4000)
    starting_credit_bdt: float = Field(default=0, ge=0, le=1_000_000)
    send_invite: bool = True


class EmailBrandingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    accent_color: str
    updated_by: str | None
    updated_at: datetime


class EmailBrandingUpdate(BaseModel):
    accent_color: str = Field(min_length=4, max_length=20)


class CompanySettingsRead(BaseModel):
    company_name: str
    legal_name: str | None
    address: str | None
    city: str | None
    country: str | None
    phone: str | None
    support_email: str | None
    website: str | None
    logo_url: str | None = None
    logo_white_url: str | None = None
    favicon_url: str | None = None
    updated_by: str | None
    updated_at: datetime


class CompanySettingsUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=150)
    legal_name: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    support_email: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=255)


class EmailTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    subject: str
    body_html: str
    placeholders: list[str] = []
    updated_by: str | None
    updated_at: datetime


class EmailTemplateUpdate(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    body_html: str = Field(min_length=1, max_length=20000)


class RegistrationListItem(BaseModel):
    """A signed-up user at whatever stage they've reached — unverified, verified but
    never paid, payment pending/failed, or fully onboarded. Independent of whether an
    Organization exists yet (it only does once onboarding finishes)."""

    user_id: uuid.UUID
    email: str
    created_at: datetime
    is_verified: bool
    org_name: str | None
    organization_id: uuid.UUID | None
    plan_name: str | None
    subscription_status: str | None
    stage: str


class ImpersonateRequest(BaseModel):
    user_id: uuid.UUID


class ImpersonateResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_email: str


class WalletAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    org_id: uuid.UUID
    org_name: str
    balance_bdt: float
    balance_paisa: int
    low_balance_threshold_bdt: float
    is_low: bool
    updated_at: datetime | None


class WalletAdjustRequest(BaseModel):
    amount_bdt: float  # positive = add, negative = deduct
    note: str = ""


class WalletAdjustResponse(BaseModel):
    balance_after_bdt: float


class RevenueSummary(BaseModel):
    mrr_bdt: int
    credit_topup_revenue_bdt: float
    total_float_bdt: float
    active_subscriptions: int
    credit_consumption_bdt: dict[str, float]


class WalletTransactionFeedRead(BaseModel):
    id: uuid.UUID
    org_name: str
    type: str
    amount_bdt: float
    service: str | None
    created_at: datetime
