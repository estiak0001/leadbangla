import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import SmsChannel, SmsCampaignStatus, SmsEventType

_vc = lambda e: [m.value for m in e]  # noqa: E731


class SmsCampaign(Base):
    __tablename__ = "sms_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    segment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("segments.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    channel: Mapped[SmsChannel] = mapped_column(
        SAEnum(SmsChannel, name="sms_channel", values_callable=_vc), nullable=False
    )
    status: Mapped[SmsCampaignStatus] = mapped_column(
        SAEnum(SmsCampaignStatus, name="sms_campaign_status", values_callable=_vc),
        nullable=False,
        default=SmsCampaignStatus.DRAFT,
    )
    sender_id: Mapped[str] = mapped_column(String(20), nullable=False, default="LeadBangla")
    message_body: Mapped[str] = mapped_column(Text, nullable=False)
    # Meta Cloud API: {name, language, params: [merge-tag text per {{n}}]} — business-started messages need a template
    wa_template: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SmsEvent(Base):
    __tablename__ = "sms_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    sms_campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sms_campaigns.id"), nullable=False, index=True
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=True
    )
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    type: Mapped[SmsEventType] = mapped_column(
        SAEnum(SmsEventType, name="sms_event_type", values_callable=_vc), nullable=False
    )
    gateway_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Why a send failed, in words a customer can act on.
    error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # opted_out_skip=True means this row records a contact that was
    # excluded from the send because they had not opted in — provably excluded.
    opted_out_skip: Mapped[bool] = mapped_column(
        __import__("sqlalchemy").Boolean, nullable=False, server_default="false", default=False
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SmsInboundMessage(Base):
    """A reply (MO/mobile-originated) SMS from a customer, received via the
    SSL Wireless inbound webhook. organization_id/contact_id are resolved
    heuristically at ingest time (see sms_service.record_inbound_sms) since
    the aggregator's payload doesn't carry a tenant identifier directly —
    both may be null if no match could be made."""

    __tablename__ = "sms_inbound_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True, index=True
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=True
    )
    from_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    to_sender_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SmsSkipEvent(Base):
    """Records every contact excluded from an SMS send due to no opt-in.

    Separate from SmsEvent so the stats are unambiguous: SmsEvent rows =
    actual sends; SmsSkipEvent rows = provably excluded opt-outs.
    """

    __tablename__ = "sms_skip_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    sms_campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sms_campaigns.id"), nullable=False, index=True
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=False
    )
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
