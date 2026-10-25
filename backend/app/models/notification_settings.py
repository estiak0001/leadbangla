import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OrgNotificationSettings(Base):
    __tablename__ = "org_notification_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    low_balance_alert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    usage_limit_alert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    low_balance_threshold_bdt: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=50)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
