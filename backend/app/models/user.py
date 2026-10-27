import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import InternalRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # True for anyone who doesn't need OTP verification (invited members, admin-created
    # tenant owners, and every row that existed before this column was added). Self-signup
    # explicitly sets this False and flips it once the signup OTP is verified.
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    internal_role: Mapped[InternalRole | None] = mapped_column(
        SAEnum(
            InternalRole,
            name="internal_role",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Business-profile fields collected at signup, staged here until the user
    # completes onboarding (which requires an active subscription — see
    # onboarding_service.complete_onboarding). Copied onto the Organization at
    # that point; not the source of truth afterwards.
    pending_org_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pending_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pending_website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pending_industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pending_company_size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pending_language: Mapped[str | None] = mapped_column(String(2), nullable=True)
