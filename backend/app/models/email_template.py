from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlatformEmailTemplate(Base):
    """The subject/body for one kind of internal transactional email (signup OTP,
    password reset OTP, team invite, ...), editable in the admin panel. The
    body supports {{placeholder}} tokens; each key's placeholders are fixed in
    code (services/email_template_service.py) since they come from what that
    send site actually has to offer. Always wrapped in the one platform email
    branding (logo/colors/footer) before sending — see email_branding_service."""

    __tablename__ = "platform_email_templates"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
