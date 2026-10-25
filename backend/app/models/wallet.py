import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OrgWallet(Base):
    __tablename__ = "org_wallets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    balance_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    low_balance_threshold_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False, default=5000)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # type values: "topup" | "deduction" | "admin_adjustment" | "refund"
    amount_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # positive = credit added; negative = deducted
    balance_after_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    service: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # "sms" | "whatsapp" | "email_overage" | "seo_query" | None
    units_consumed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WalletTopUp(Base):
    """A pending top-up intent, created before redirecting to checkout and
    resolved by tran_id in the IPN/fake-checkout callback — same pattern as
    `Subscription.tran_id` for plan checkout, so org_id never has to be
    encoded into the tran_id string itself."""

    __tablename__ = "wallet_topups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tran_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # status values: "pending" | "completed"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
