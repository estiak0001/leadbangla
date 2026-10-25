import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import SubscriptionStatus


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_bdt: Mapped[int] = mapped_column(Integer, nullable=False)
    billing_interval: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # -1 means unlimited for any integer limit column below
    contacts_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    emails_monthly_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)
    team_members_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    workflows_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    landing_pages_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    social_accounts_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    seo_credits_monthly: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    custom_domain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    priority_support: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # SMS entitlements. sms_monthly_limit: -1 unlimited, 0 none. Credits are still
    # charged from the wallet per message; this is the plan's permission + monthly cap.
    sms_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    sms_monthly_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=300, server_default="300")
    # WhatsApp messages per month (-1 unlimited, 0 none). Wallet credits are charged on top.
    whatsapp_monthly_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    masking_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id"), nullable=False)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        SAEnum(
            SubscriptionStatus,
            name="subscription_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=SubscriptionStatus.PENDING,
    )
    tran_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    gateway_val_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # "payment" = bought by the customer; "admin" = set by platform staff (no payment taken).
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="payment", server_default="payment")
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan: Mapped["Plan"] = relationship("Plan")


class CreditRate(Base):
    __tablename__ = "credit_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    rate_bdt: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    unit_label: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
