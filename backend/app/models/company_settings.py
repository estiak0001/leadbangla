import uuid
from datetime import datetime

from sqlalchemy import DateTime, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlatformCompanySettings(Base):
    """LeadBangla's own company profile — one row, edited in the admin panel.
    The logo here is the single source for every internal email template
    (via email_branding_service) and anywhere else the platform needs its own
    identity, so it isn't duplicated as a separate URL field elsewhere."""

    __tablename__ = "platform_company_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(150), nullable=False, default="LeadBangla", server_default="LeadBangla")
    legal_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Bangladesh", server_default="Bangladesh")
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    support_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Deferred: never loaded by a plain settings read, only by the logo/favicon-serving routes.
    logo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Light/white variant of the logo, for dark or colored backgrounds (the admin
    # sidebar, the email header bar). Falls back to the main logo if not set.
    logo_white_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    logo_white_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    favicon_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    favicon_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
