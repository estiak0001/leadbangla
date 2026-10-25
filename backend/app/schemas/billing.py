import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.enums import SubscriptionStatus


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    price_bdt: int
    billing_interval: str


class SubscribeRequest(BaseModel):
    plan_id: uuid.UUID


class SubscribeResponse(BaseModel):
    subscription_id: uuid.UUID
    checkout_url: str


class SubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: SubscriptionStatus
    plan: PlanRead


class PlanLimits(BaseModel):
    contacts_limit: int = Field(ge=-1)
    emails_monthly_limit: int = Field(ge=-1)
    team_members_limit: int = Field(ge=-1)
    workflows_limit: int = Field(ge=-1)
    landing_pages_limit: int = Field(ge=-1)
    social_accounts_limit: int = Field(ge=-1)
    seo_credits_monthly: int = Field(ge=-1)
    custom_domain: bool
    priority_support: bool
    sms_enabled: bool = True
    sms_monthly_limit: int = Field(default=300, ge=-1)
    masking_allowed: bool = False
    whatsapp_enabled: bool = False
    whatsapp_monthly_limit: int = Field(default=0, ge=-1)


class PlanPublic(PlanRead, PlanLimits):
    """Public pricing page: plan with its limits."""

    model_config = ConfigDict(from_attributes=True)


class PlanReadFull(PlanRead, PlanLimits):
    """Admin-facing: plan with limits + tenant count."""

    model_config = ConfigDict(from_attributes=True)

    is_active: bool
    tenant_count: int = 0


class PlanCreate(PlanLimits):
    code: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)
    price_bdt: int = Field(ge=0)
    billing_interval: str = "monthly"
    is_active: bool = True


class PlanUpdate(BaseModel):
    name: str | None = None
    price_bdt: int | None = Field(default=None, ge=0)
    billing_interval: str | None = None
    is_active: bool | None = None
    contacts_limit: int | None = Field(default=None, ge=-1)
    emails_monthly_limit: int | None = Field(default=None, ge=-1)
    team_members_limit: int | None = Field(default=None, ge=-1)
    workflows_limit: int | None = Field(default=None, ge=-1)
    landing_pages_limit: int | None = Field(default=None, ge=-1)
    social_accounts_limit: int | None = Field(default=None, ge=-1)
    seo_credits_monthly: int | None = Field(default=None, ge=-1)
    custom_domain: bool | None = None
    priority_support: bool | None = None
    sms_enabled: bool | None = None
    sms_monthly_limit: int | None = Field(default=None, ge=-1)
    masking_allowed: bool | None = None
    whatsapp_enabled: bool | None = None
    whatsapp_monthly_limit: int | None = Field(default=None, ge=-1)


class CreditRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service: str
    rate_bdt: Decimal
    unit_label: str
    description: str | None
    is_active: bool
    updated_at: datetime
    updated_by: str | None


class CreditRateUpdate(BaseModel):
    rate_bdt: Decimal = Field(ge=0)  # 0 is allowed: it makes that item free


class WalletRead(BaseModel):
    balance_paisa: int
    balance_bdt: float


class TopUpRequest(BaseModel):
    amount_bdt: float  # minimum 100


class TopUpResponse(BaseModel):
    tran_id: str
    checkout_url: str


class WalletTransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    amount_paisa: int
    balance_after_paisa: int
    service: str | None
    units_consumed: int | None
    reference_id: str | None
    note: str | None
    created_at: datetime

    @computed_field
    @property
    def amount_bdt(self) -> float:
        return self.amount_paisa / 100

    @computed_field
    @property
    def balance_after_bdt(self) -> float:
        return self.balance_after_paisa / 100


class ResourceUsage(BaseModel):
    used: int
    limit: int


class PlanUsageRead(BaseModel):
    plan_name: str
    plan_price_bdt: int
    contacts: ResourceUsage
    emails_monthly: ResourceUsage
    workflows: ResourceUsage
    landing_pages: ResourceUsage
    team_members: ResourceUsage
    seo_credits: ResourceUsage
    custom_domain: bool
    priority_support: bool
    sms: ResourceUsage | None = None
    sms_enabled: bool = True
    masking_allowed: bool = False
    whatsapp_enabled: bool = False
    wallet_balance_bdt: float
    wallet_balance_paisa: int


class NotificationPrefsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    low_balance_alert: bool
    usage_limit_alert: bool
    low_balance_threshold_bdt: Decimal


class NotificationPrefsUpdate(BaseModel):
    low_balance_alert: bool | None = None
    usage_limit_alert: bool | None = None
    low_balance_threshold_bdt: float | None = None
