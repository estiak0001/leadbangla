import uuid

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wallet import OrgWallet, WalletTopUp, WalletTransaction


class InsufficientBalanceError(Exception):
    def __init__(self, balance_paisa: int, required_paisa: int):
        self.balance_bdt = balance_paisa / 100
        self.required_bdt = required_paisa / 100
        super().__init__(f"Balance {self.balance_bdt:.2f} BDT < {self.required_bdt:.2f} BDT required")


class TopUpNotFoundError(Exception):
    pass


async def _get_or_create_wallet(db: AsyncSession, org_id: uuid.UUID, *, lock: bool = False) -> OrgWallet:
    query = select(OrgWallet).where(OrgWallet.organization_id == org_id)
    if lock:
        query = query.with_for_update()
    wallet = await db.scalar(query)
    if wallet is None:
        wallet = OrgWallet(organization_id=org_id)
        db.add(wallet)
        await db.flush()
    return wallet


async def get_balance(db: AsyncSession, org_id: uuid.UUID) -> int:
    """Returns balance in paisa."""
    wallet = await _get_or_create_wallet(db, org_id)
    return wallet.balance_paisa


async def deduct(
    db: AsyncSession,
    org_id: uuid.UUID,
    cost_paisa: int,
    service: str,
    units: int,
    reference_id: str | None = None,
    note: str | None = None,
) -> WalletTransaction:
    """Atomically deducts cost_paisa from wallet. Locks the wallet row for
    the duration of the transaction to prevent concurrent-send races.
    Raises InsufficientBalanceError if balance would go negative — caller
    is responsible for committing (or rolling back) afterward."""
    wallet = await _get_or_create_wallet(db, org_id, lock=True)

    if wallet.balance_paisa < cost_paisa:
        raise InsufficientBalanceError(wallet.balance_paisa, cost_paisa)

    wallet.balance_paisa -= cost_paisa
    txn = WalletTransaction(
        organization_id=org_id,
        type="deduction",
        amount_paisa=-cost_paisa,
        balance_after_paisa=wallet.balance_paisa,
        service=service,
        units_consumed=units,
        reference_id=reference_id,
        note=note,
    )
    db.add(txn)
    await db.flush()
    return txn


async def topup(db: AsyncSession, org_id: uuid.UUID, amount_paisa: int, tran_id: str) -> WalletTransaction:
    """Adds amount to wallet. Called after a top-up checkout is confirmed."""
    wallet = await _get_or_create_wallet(db, org_id, lock=True)

    wallet.balance_paisa += amount_paisa
    txn = WalletTransaction(
        organization_id=org_id,
        type="topup",
        amount_paisa=amount_paisa,
        balance_after_paisa=wallet.balance_paisa,
        reference_id=tran_id,
    )
    db.add(txn)
    await db.flush()
    return txn


async def refund(
    db: AsyncSession, org_id: uuid.UUID, amount_paisa: int, *, service: str, reference_id: str, note: str
) -> WalletTransaction:
    """Give back a charge for a message the gateway refused to send."""
    wallet = await _get_or_create_wallet(db, org_id, lock=True)
    wallet.balance_paisa += amount_paisa
    txn = WalletTransaction(
        organization_id=org_id, type="refund", amount_paisa=amount_paisa,
        balance_after_paisa=wallet.balance_paisa, service=service, reference_id=reference_id, note=note,
    )
    db.add(txn)
    await db.flush()
    return txn


async def admin_adjust(
    db: AsyncSession, org_id: uuid.UUID, amount_paisa: int, note: str, admin_email: str
) -> WalletTransaction:
    """amount_paisa: positive = add, negative = deduct."""
    wallet = await _get_or_create_wallet(db, org_id, lock=True)

    wallet.balance_paisa += amount_paisa
    txn = WalletTransaction(
        organization_id=org_id,
        type="admin_adjustment",
        amount_paisa=amount_paisa,
        balance_after_paisa=wallet.balance_paisa,
        note=f"[{admin_email}] {note}",
    )
    db.add(txn)
    await db.flush()
    return txn


async def list_transactions(
    db: AsyncSession, org_id: uuid.UUID, limit: int = 50, offset: int = 0
) -> list[WalletTransaction]:
    rows = await db.scalars(
        select(WalletTransaction)
        .where(WalletTransaction.organization_id == org_id)
        .order_by(desc(WalletTransaction.created_at))
        .limit(limit)
        .offset(offset)
    )
    return list(rows)


# ── Pending top-up intents ──────────────────────────────────────────────────


async def create_pending_topup(db: AsyncSession, org_id: uuid.UUID, amount_paisa: int) -> WalletTopUp:
    pending = WalletTopUp(
        organization_id=org_id,
        amount_paisa=amount_paisa,
        tran_id=f"TOPUP-{uuid.uuid4().hex}",
    )
    db.add(pending)
    await db.commit()
    await db.refresh(pending)
    return pending


async def get_pending_topup(db: AsyncSession, tran_id: str) -> WalletTopUp:
    pending = await db.scalar(select(WalletTopUp).where(WalletTopUp.tran_id == tran_id))
    if pending is None:
        raise TopUpNotFoundError(tran_id)
    return pending


async def complete_topup(db: AsyncSession, tran_id: str) -> WalletTopUp:
    """Idempotent: a top-up already marked completed is a no-op, so a
    duplicate IPN callback (SSLCommerz may retry) can't double-credit."""
    pending = await get_pending_topup(db, tran_id)
    if pending.status == "completed":
        return pending

    await topup(db, pending.organization_id, pending.amount_paisa, tran_id)
    pending.status = "completed"
    await db.commit()
    await db.refresh(pending)
    from app.services import inbox  # noqa: PLC0415

    await inbox.notify(db, pending.organization_id, await inbox.recipients_with_permission(db, pending.organization_id, "billing"),
                       category="billing", kind="wallet_topup", title=f"Wallet topped up: ৳{pending.amount_paisa / 100:,.2f}",
                       link="/billing?tab=wallet",
                       email_html=f"<p>We received your top-up of <strong>৳{pending.amount_paisa / 100:,.2f}</strong>. It is in your wallet now.</p>")
    return pending
