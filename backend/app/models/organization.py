import uuid
from datetime import datetime

from sqlalchemy import Text, Boolean, DateTime, Enum as SAEnum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import OrgLanguage, TenantRole
from app.models.user import User


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    company_size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Optional extra name — e.g. a branch or trading name ("Gulshan Branch").
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    trade_license_no: Mapped[str | None] = mapped_column(String(60), nullable=True)
    tin: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Org's requested BTRC masking Sender ID for SMS campaigns. Only used for
    # live sending once sms_sender_id_approved is True (set by platform staff
    # after confirming approval with the aggregator) — otherwise sending
    # falls back to the platform's shared non-masking default.
    sms_sender_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sms_sender_id_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # WhatsApp business number the org wants to message from; live WhatsApp
    # sending is blocked until platform staff approve it (see verification_service).
    whatsapp_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    whatsapp_phone_number_id: Mapped[str | None] = mapped_column(String(40), nullable=True)  # Meta phone number id, if this customer has its own
    # The customer's own Meta account (encrypted JSON: access_token, phone_number_id, waba_id, app_secret, verify_token)
    whatsapp_meta_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_webhook_key: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True)
    whatsapp_number_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Staff controls: a suspended org's members are locked out; notes are never shown to customers.
    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    suspended_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[OrgLanguage] = mapped_column(
        SAEnum(
            OrgLanguage,
            name="org_language",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=OrgLanguage.EN,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["OrganizationMember"]] = relationship("OrganizationMember")


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member_org_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role: Mapped[TenantRole] = mapped_column(
        SAEnum(
            TenantRole,
            name="tenant_role",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    permissions: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)  # None = role default
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    invite_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    job_title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped["Organization"] = relationship("Organization", overlaps="members")
    user: Mapped[User] = relationship("User")
