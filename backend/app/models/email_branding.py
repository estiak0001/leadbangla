import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlatformEmailBranding(Base):
    """The one stylistic choice for every internal/transactional email
    LeadBangla itself sends (OTP, invites, alerts, notifications) — editable
    in the admin panel, applied the same way to every recipient. Who LeadBangla
    *is* (name, logo, address, contact) lives in PlatformCompanySettings
    instead, so it's set once and shared, not duplicated here. Customer
    campaign emails (sent through an org's own verified sender) are untouched
    by any of this."""

    __tablename__ = "platform_email_branding"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    accent_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#4f46e5", server_default="#4f46e5")
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
