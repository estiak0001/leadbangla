import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import CampaignChannel, CampaignStatus


def _enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    segment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("segments.id"), nullable=True
    )
    sender_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sender_addresses.id", ondelete="SET NULL"), nullable=True
    )
    channel: Mapped[CampaignChannel] = mapped_column(
        SAEnum(CampaignChannel, name="campaign_channel", values_callable=_enum_values),
        nullable=False,
        default=CampaignChannel.EMAIL,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[CampaignStatus] = mapped_column(
        SAEnum(CampaignStatus, name="campaign_status", values_callable=_enum_values),
        nullable=False,
        default=CampaignStatus.DRAFT,
    )
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    html_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Recipient count snapshotted when sending starts — the denominator for
    # the live "N of total sent" progress display.
    total_recipients: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Checked between sends by the running Celery task; set via the cancel
    # endpoint to stop an in-progress send without killing the worker.
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    reply_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
