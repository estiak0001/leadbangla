import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import SeoAuditStatus

_vc = lambda e: [m.value for m in e]  # noqa: E731


class SeoAudit(Base):
    __tablename__ = "seo_audits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    status: Mapped[SeoAuditStatus] = mapped_column(
        SAEnum(SeoAuditStatus, name="seoauditstatus", values_callable=_vc),
        nullable=False,
        default=SeoAuditStatus.PENDING,
        server_default="pending",
    )
    pages_crawled: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SeoPage(Base):
    __tablename__ = "seo_pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    audit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seo_audits.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    http_status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    title_length: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meta_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    meta_description_length: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    h1_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    h1_text: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    canonical_url: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    has_noindex: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    img_without_alt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    internal_links_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    broken_links: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    issues: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    crawled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
