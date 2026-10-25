import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.models.base import Base


class InboxDomain(Base):
    """A domain (usually a subdomain like mail.example.com) whose MX points at Amazon SES, so we receive its mail."""

    __tablename__ = "inbox_domains"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    sending_domain_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sending_domains.id", ondelete="CASCADE"), nullable=False)
    receive_domain: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")   # pending | active | disabled
    mx_value: Mapped[str] = mapped_column(String(300), nullable=False)
    catch_all: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    dns_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InboxAddress(Base):
    __tablename__ = "inbox_addresses"
    __table_args__ = (UniqueConstraint("inbox_domain_id", "local_part", name="uq_inbox_address_local"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    inbox_domain_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inbox_domains.id", ondelete="CASCADE"), nullable=False)
    local_part: Mapped[str] = mapped_column(String(64), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MailThread(Base):
    __tablename__ = "mail_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    address_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inbox_addresses.id", ondelete="SET NULL"), nullable=True)
    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    snippet_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    folder: Mapped[str] = mapped_column(String(12), nullable=False, default="inbox")
    starred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    has_outgoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    participants: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MailMessage(Base):
    __tablename__ = "mail_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    thread_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mail_threads.id", ondelete="CASCADE"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(3), nullable=False)
    message_id_header: Mapped[str | None] = mapped_column(String(500), nullable=True)
    in_reply_to: Mapped[str | None] = mapped_column(String(500), nullable=True)
    references_hdr: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    from_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    to_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    cc_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    text_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    snippet_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    raw_key: Mapped[str | None] = mapped_column(String(600), nullable=True)
    spam_verdict: Mapped[str | None] = mapped_column(String(12), nullable=True)
    virus_verdict: Mapped[str | None] = mapped_column(String(12), nullable=True)
    spf_verdict: Mapped[str | None] = mapped_column(String(12), nullable=True)
    dkim_verdict: Mapped[str | None] = mapped_column(String(12), nullable=True)
    dmarc_verdict: Mapped[str | None] = mapped_column(String(12), nullable=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="received")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class MailAttachment(Base):
    __tablename__ = "mail_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mail_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False, default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    data: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))


class MailUpload(Base):
    """A file attached to a message being written; removed after sending or after a day."""

    __tablename__ = "mail_uploads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
