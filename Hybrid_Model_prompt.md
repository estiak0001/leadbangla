# LeadBangla — Hybrid Payment Model: Full Implementation Prompts

Build these steps in order. Each step is self-contained; complete and verify the DoD
before moving to the next. All Steps 1–21 (from `prompt.md`) are already built.

---

## Architecture recap (read before starting)

```
Customer pays LeadBangla ──► LeadBangla pays providers   (SMS, Email)
Customer connects own accounts ──► BYOC, free API        (Social, Paid Ads)
Platform manages at zero cost ──► No billing needed       (Push, Basic SEO)
```

**Four revenue streams:**
1. Monthly plan subscription (BDT via SSLCommerz)
2. SMS/WhatsApp wallet credits (BDT top-up, ~60% margin)
3. Email overage credits (BDT per 1 000 emails, ~94% margin)
4. SEO query credits (BDT per DataForSEO call, ~89% margin)

**Existing code to know before touching anything:**
- `backend/app/models/billing.py` → `Plan` (id, code, name, price_bdt, billing_interval, is_active), `Subscription`
- `backend/app/api/v1/billing.py` → existing routes under prefix `/billing`
- `backend/app/api/v1/admin.py` → existing admin routes under prefix `/admin`
- `backend/app/core/deps.py` → `get_current_membership` (tenant auth), `get_current_internal_user` (admin auth)
- Alembic migrations end at `0016_create_paid_ads.py` → next migration is `0017`
- Admin panel: `frontend/admin-panel/src/` — App.tsx, tenants/, components/, lib/admin.ts
- Main app: `frontend/main-app/src/modules/billing/` — CheckoutSuccessPage, CheckoutCancelPage exist; no `/billing` page yet

**Deployment rule:** hot-patch Python files via `docker compose cp file backend:/app/app/...` then `docker compose restart backend`. Run migrations via `docker compose exec backend alembic upgrade head`. Clear `__pycache__` after patching if imports fail.

---

## Step 22 — Plan Limits & Credit Rates

**Phase:** 6a · **Depends on:** Steps 1–21  
**Migration:** `0017_add_plan_limits_and_credit_rates.py`

### Goal

Attach resource limits to every plan (contacts, emails/month, team members, etc.)
and create a global credit-rate table that the admin can edit. No enforcement yet —
just the data layer and admin UI to control it.

---

### Backend — Migration `0017`

File: `backend/alembic/versions/0017_add_plan_limits_and_credit_rates.py`

```python
revision = "0017"
down_revision = "0016"

def upgrade():
    # 1. Add limit columns to existing plans table
    op.add_column("plans", sa.Column("contacts_limit", sa.Integer(), nullable=False, server_default="2000"))
    op.add_column("plans", sa.Column("emails_monthly_limit", sa.Integer(), nullable=False, server_default="10000"))
    op.add_column("plans", sa.Column("team_members_limit", sa.Integer(), nullable=False, server_default="2"))
    op.add_column("plans", sa.Column("workflows_limit", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("plans", sa.Column("landing_pages_limit", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("plans", sa.Column("social_accounts_limit", sa.Integer(), nullable=False, server_default="2"))
    op.add_column("plans", sa.Column("seo_credits_monthly", sa.Integer(), nullable=False, server_default="50"))
    op.add_column("plans", sa.Column("custom_domain", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("plans", sa.Column("priority_support", sa.Boolean(), nullable=False, server_default="false"))
    # -1 = unlimited (used for Enterprise plan)

    # 2. Update existing plan rows with correct limits by plan code
    op.execute("""
        UPDATE plans SET
            contacts_limit = CASE code
                WHEN 'starter'    THEN 2000
                WHEN 'growth'     THEN 25000
                WHEN 'enterprise' THEN -1
            END,
            emails_monthly_limit = CASE code
                WHEN 'starter'    THEN 10000
                WHEN 'growth'     THEN 75000
                WHEN 'enterprise' THEN 300000
            END,
            team_members_limit = CASE code
                WHEN 'starter'    THEN 2
                WHEN 'growth'     THEN 5
                WHEN 'enterprise' THEN -1
            END,
            workflows_limit = CASE code
                WHEN 'starter'    THEN 3
                WHEN 'growth'     THEN 20
                WHEN 'enterprise' THEN -1
            END,
            landing_pages_limit = CASE code
                WHEN 'starter'    THEN 3
                WHEN 'growth'     THEN 20
                WHEN 'enterprise' THEN -1
            END,
            social_accounts_limit = CASE code
                WHEN 'starter'    THEN 2
                WHEN 'growth'     THEN 10
                WHEN 'enterprise' THEN -1
            END,
            seo_credits_monthly = CASE code
                WHEN 'starter'    THEN 50
                WHEN 'growth'     THEN 300
                WHEN 'enterprise' THEN 1000
            END,
            custom_domain = (code IN ('growth', 'enterprise')),
            priority_support = (code = 'enterprise')
        WHERE code IN ('starter', 'growth', 'enterprise')
    """)

    # 3. Create credit_rates table
    op.create_table(
        "credit_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("service", sa.String(30), nullable=False, unique=True),
        sa.Column("rate_bdt", sa.Numeric(10, 4), nullable=False),
        sa.Column("unit_label", sa.String(50), nullable=False),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("updated_by", sa.String(100), nullable=True),
    )

    # 4. Seed credit_rates with 4 rows
    op.execute("""
        INSERT INTO credit_rates (id, service, rate_bdt, unit_label, description) VALUES
        (gen_random_uuid(), 'sms',           1.0000, 'per SMS',            'Domestic BD SMS via SSL Wireless'),
        (gen_random_uuid(), 'whatsapp',      5.0000, 'per conversation',   'WhatsApp via SSL Wireless BSP'),
        (gen_random_uuid(), 'email_overage', 8.0000, 'per 1,000 emails',   'Email sends beyond monthly plan limit'),
        (gen_random_uuid(), 'seo_query',     2.0000, 'per query',          'DataForSEO SERP/backlink API call')
        ON CONFLICT (service) DO NOTHING
    """)

def downgrade():
    op.drop_table("credit_rates")
    for col in ["contacts_limit","emails_monthly_limit","team_members_limit",
                "workflows_limit","landing_pages_limit","social_accounts_limit",
                "seo_credits_monthly","custom_domain","priority_support"]:
        op.drop_column("plans", col)
```

---

### Backend — Model update (`backend/app/models/billing.py`)

Add columns to the existing `Plan` class (matching the migration above):

```python
contacts_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
emails_monthly_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)
team_members_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
workflows_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
landing_pages_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
social_accounts_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
seo_credits_monthly: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
custom_domain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
priority_support: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
# -1 means unlimited for any integer limit column
```

Add new `CreditRate` model to the same file:

```python
from sqlalchemy import Numeric

class CreditRate(Base):
    __tablename__ = "credit_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    rate_bdt: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    unit_label: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

Add both to `backend/app/models/__init__.py`:
```python
from app.models.billing import Plan, Subscription, CreditRate
```

---

### Backend — Services

**`backend/app/services/plan_service.py`** (new file):

```python
from decimal import Decimal
import uuid
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.billing import Plan, CreditRate, Subscription
from app.models.enums import SubscriptionStatus
from app.models.organization import OrganizationMember

async def get_org_plan(db: AsyncSession, org_id: uuid.UUID) -> Plan | None:
    """Returns the active Plan for an org, or None if no active subscription."""
    sub = await db.scalar(
        select(Subscription)
        .join(Plan)
        .where(
            Subscription.organization_id == org_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
        )
        .order_by(Subscription.created_at.desc())
    )
    return sub.plan if sub else None

async def get_plan_limit(db: AsyncSession, org_id: uuid.UUID, field: str) -> int:
    """Returns limit value for field. -1 = unlimited. 0 if no plan found."""
    plan = await get_org_plan(db, org_id)
    if plan is None:
        return 0
    return getattr(plan, field, 0)

async def get_credit_rate(db: AsyncSession, service: str) -> CreditRate | None:
    return await db.scalar(
        select(CreditRate).where(CreditRate.service == service, CreditRate.is_active.is_(True))
    )

async def list_all_plans(db: AsyncSession) -> list[Plan]:
    return list(await db.scalars(select(Plan).order_by(Plan.price_bdt)))

async def list_credit_rates(db: AsyncSession) -> list[CreditRate]:
    return list(await db.scalars(select(CreditRate).order_by(CreditRate.service)))

async def update_plan(db: AsyncSession, plan_id: uuid.UUID, data: dict) -> Plan:
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise ValueError("Plan not found")
    for k, v in data.items():
        setattr(plan, k, v)
    await db.commit()
    await db.refresh(plan)
    return plan

async def update_credit_rate(db: AsyncSession, rate_id: uuid.UUID, rate_bdt: Decimal, admin_email: str) -> CreditRate:
    rate = await db.get(CreditRate, rate_id)
    if rate is None:
        raise ValueError("Rate not found")
    rate.rate_bdt = rate_bdt
    rate.updated_by = admin_email
    await db.commit()
    await db.refresh(rate)
    return rate

async def count_org_tenants_per_plan(db: AsyncSession) -> dict[uuid.UUID, int]:
    """Returns {plan_id: tenant_count} for all plans."""
    rows = await db.execute(
        select(Subscription.plan_id, func.count(Subscription.id))
        .where(Subscription.status == SubscriptionStatus.ACTIVE)
        .group_by(Subscription.plan_id)
    )
    return {plan_id: count for plan_id, count in rows.all()}
```

---

### Backend — Schemas (`backend/app/schemas/billing.py`)

Extend existing file — do NOT replace it, only add:

```python
from decimal import Decimal

class PlanLimits(BaseModel):
    contacts_limit: int
    emails_monthly_limit: int
    team_members_limit: int
    workflows_limit: int
    landing_pages_limit: int
    social_accounts_limit: int
    seo_credits_monthly: int
    custom_domain: bool
    priority_support: bool

class PlanReadFull(PlanRead, PlanLimits):
    """Admin-facing: plan with limits + tenant count."""
    tenant_count: int = 0

class PlanUpdate(BaseModel):
    name: str | None = None
    price_bdt: int | None = None
    billing_interval: str | None = None
    is_active: bool | None = None
    contacts_limit: int | None = None
    emails_monthly_limit: int | None = None
    team_members_limit: int | None = None
    workflows_limit: int | None = None
    landing_pages_limit: int | None = None
    social_accounts_limit: int | None = None
    seo_credits_monthly: int | None = None
    custom_domain: bool | None = None
    priority_support: bool | None = None

class CreditRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    service: str
    rate_bdt: Decimal
    unit_label: str
    description: str | None
    is_active: bool
    updated_at: datetime
    updated_by: str | None

class CreditRateUpdate(BaseModel):
    rate_bdt: Decimal
```

---

### Backend — Admin Routes (add to `backend/app/api/v1/admin.py`)

```python
from app.services.plan_service import (
    list_all_plans, list_credit_rates, update_plan, update_credit_rate, count_org_tenants_per_plan
)
from app.schemas.billing import PlanReadFull, PlanUpdate, CreditRateRead, CreditRateUpdate

@router.get("/plans", response_model=list[PlanReadFull])
async def admin_list_plans(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    plans = await list_all_plans(db)
    counts = await count_org_tenants_per_plan(db)
    return [
        PlanReadFull(**{**p.__dict__, "tenant_count": counts.get(p.id, 0)})
        for p in plans
    ]

@router.patch("/plans/{plan_id}", response_model=PlanReadFull)
async def admin_update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    user: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    plan = await update_plan(db, plan_id, body.model_dump(exclude_none=True))
    counts = await count_org_tenants_per_plan(db)
    return PlanReadFull(**{**plan.__dict__, "tenant_count": counts.get(plan.id, 0)})

@router.get("/credit-rates", response_model=list[CreditRateRead])
async def admin_list_rates(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_credit_rates(db)

@router.patch("/credit-rates/{rate_id}", response_model=CreditRateRead)
async def admin_update_rate(
    rate_id: uuid.UUID,
    body: CreditRateUpdate,
    user: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_credit_rate(db, rate_id, body.rate_bdt, user.email)
```

---

### Admin Panel — Plans & Rates Page

**New file:** `frontend/admin-panel/src/plans/PlansPage.tsx`

Layout — two sections on one page:

**Section 1: Subscription Plans**

Table columns: Name | Code | Price (BDT/mo) | Contacts | Emails/mo | Team | Workflows | Landing Pages | Social Acc. | SEO Credits | Tenants | Active | Edit

- "Active" column: green "Yes" / red "No" badge
- "Tenants" column: count of currently subscribed orgs
- "Edit" → opens modal with all plan fields editable
- "-1" displayed as "Unlimited" in all limit cells

Edit modal fields: Name · Price BDT · Contacts limit · Emails/month · Team members · Workflows · Landing pages · Social accounts · SEO credits/month · Custom domain (checkbox) · Priority support (checkbox) · Active (checkbox)

**Section 2: Credit Rates**

Table columns: Service | Rate (BDT) | Unit | Description | Last Updated | Updated By | Edit

- "Edit" → inline number input that appears in place of the rate value; "Save" and "Cancel" buttons
- Show 4 rows (sms, whatsapp, email_overage, seo_query)
- Rate changes are effective immediately (no confirmation needed — they apply to future sends only)

**Add to `frontend/admin-panel/src/App.tsx`:**
```tsx
import PlansPage from "./plans/PlansPage";
<Route path="/plans" element={<PlansPage />} />
```

**Add to admin `AppLayout.tsx` nav:**
```tsx
<Link to="/plans">Plans & Rates</Link>
```

**New `frontend/admin-panel/src/lib/plans.ts`:**
```typescript
export interface PlanFull {
  id: string; code: string; name: string; price_bdt: number; billing_interval: string;
  contacts_limit: number; emails_monthly_limit: number; team_members_limit: number;
  workflows_limit: number; landing_pages_limit: number; social_accounts_limit: number;
  seo_credits_monthly: number; custom_domain: boolean; priority_support: boolean;
  is_active: boolean; tenant_count: number;
}
export interface CreditRate {
  id: string; service: string; rate_bdt: string; unit_label: string;
  description: string | null; updated_at: string; updated_by: string | null;
}
export async function listAdminPlans(): Promise<PlanFull[]>      // GET /admin/plans
export async function updatePlan(id: string, patch: Partial<PlanFull>): Promise<PlanFull>  // PATCH /admin/plans/{id}
export async function listCreditRates(): Promise<CreditRate[]>    // GET /admin/credit-rates
export async function updateCreditRate(id: string, rate_bdt: number): Promise<CreditRate>  // PATCH /admin/credit-rates/{id}
```

**DoD:** editing the Growth plan's email limit from 75 000 to 80 000 in the admin panel
takes effect immediately (persisted to DB); editing the SMS rate from 1.00 to 1.20 BDT
is reflected in subsequent SMS deductions (verified in Step 23).

---

## Step 23 — Wallet & Credit System

**Phase:** 6b · **Depends on:** Step 22  
**Migration:** `0018_create_wallet_tables.py`

### Goal

Create the wallet (per-org credit balance) and transaction log. Wire deductions into
SMS sends and email overage sends. Build the SSLCommerz top-up flow for tenants.

---

### Backend — Migration `0018`

File: `backend/alembic/versions/0018_create_wallet_tables.py`

```python
revision = "0018"
down_revision = "0017"

def upgrade():
    op.create_table(
        "org_wallets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("balance_paisa", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("low_balance_threshold_paisa", sa.BigInteger(), nullable=False, server_default="5000"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_org_wallets_organization_id", "org_wallets", ["organization_id"])

    op.create_table(
        "wallet_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("amount_paisa", sa.BigInteger(), nullable=False),
        sa.Column("balance_after_paisa", sa.BigInteger(), nullable=False),
        sa.Column("service", sa.String(30), nullable=True),
        sa.Column("units_consumed", sa.Integer(), nullable=True),
        sa.Column("reference_id", sa.String(128), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_wallet_transactions_organization_id", "wallet_transactions", ["organization_id"])
    op.create_index("ix_wallet_transactions_created_at", "wallet_transactions", ["created_at"])
```

Amounts are stored in **paisa** (1 BDT = 100 paisa) as BigInteger to avoid float
rounding. Convert to BDT only at the display layer.

---

### Backend — Models (`backend/app/models/wallet.py`)

```python
import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class OrgWallet(Base):
    __tablename__ = "org_wallets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True)
    balance_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    low_balance_threshold_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False, default=5000)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
        server_default=func.now(), onupdate=func.now())

class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # type values: "topup" | "deduction" | "admin_adjustment" | "refund"
    amount_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # positive = credit added; negative = deducted
    balance_after_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    service: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # "sms" | "whatsapp" | "email_overage" | "seo_query" | None
    units_consumed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # SSLCommerz tran_id for topups; campaign_id for deductions
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

Add to `backend/app/models/__init__.py`:
```python
from app.models.wallet import OrgWallet, WalletTransaction
```

---

### Backend — Wallet Service (`backend/app/services/wallet_service.py`)

```python
from __future__ import annotations
import uuid
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.wallet import OrgWallet, WalletTransaction


class InsufficientBalanceError(Exception):
    def __init__(self, balance_paisa: int, required_paisa: int):
        self.balance_bdt = balance_paisa / 100
        self.required_bdt = required_paisa / 100
        super().__init__(f"Balance {self.balance_bdt:.2f} BDT < {self.required_bdt:.2f} BDT required")


async def _get_or_create_wallet(db: AsyncSession, org_id: uuid.UUID) -> OrgWallet:
    wallet = await db.scalar(
        select(OrgWallet).where(OrgWallet.organization_id == org_id)
    )
    if wallet is None:
        wallet = OrgWallet(organization_id=org_id)
        db.add(wallet)
        await db.flush()
    return wallet


async def get_balance(db: AsyncSession, org_id: uuid.UUID) -> int:
    """Returns balance in paisa."""
    wallet = await _get_or_create_wallet(db, org_id)
    return wallet.balance_paisa


async def can_afford(db: AsyncSession, org_id: uuid.UUID, cost_paisa: int) -> bool:
    wallet = await _get_or_create_wallet(db, org_id)
    return wallet.balance_paisa >= cost_paisa


async def deduct(
    db: AsyncSession,
    org_id: uuid.UUID,
    cost_paisa: int,
    service: str,
    units: int,
    reference_id: str | None = None,
    note: str | None = None,
) -> WalletTransaction:
    """
    Atomically deducts cost_paisa from wallet.
    Uses SELECT FOR UPDATE to prevent race conditions.
    Raises InsufficientBalanceError if balance would go negative.
    """
    from sqlalchemy import with_for_update
    wallet = await db.scalar(
        select(OrgWallet)
        .where(OrgWallet.organization_id == org_id)
        .with_for_update()
    )
    if wallet is None:
        wallet = OrgWallet(organization_id=org_id)
        db.add(wallet)
        await db.flush()

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


async def topup(
    db: AsyncSession,
    org_id: uuid.UUID,
    amount_paisa: int,
    tran_id: str,
) -> WalletTransaction:
    """Adds amount to wallet. Called after SSLCommerz IPN confirms payment."""
    wallet = await db.scalar(
        select(OrgWallet).where(OrgWallet.organization_id == org_id).with_for_update()
    )
    if wallet is None:
        wallet = OrgWallet(organization_id=org_id)
        db.add(wallet)
        await db.flush()

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


async def admin_adjust(
    db: AsyncSession,
    org_id: uuid.UUID,
    amount_paisa: int,   # positive = add, negative = deduct
    note: str,
    admin_email: str,
) -> WalletTransaction:
    wallet = await db.scalar(
        select(OrgWallet).where(OrgWallet.organization_id == org_id).with_for_update()
    )
    if wallet is None:
        wallet = OrgWallet(organization_id=org_id)
        db.add(wallet)
        await db.flush()

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
    from sqlalchemy import desc
    rows = await db.scalars(
        select(WalletTransaction)
        .where(WalletTransaction.organization_id == org_id)
        .order_by(desc(WalletTransaction.created_at))
        .limit(limit).offset(offset)
    )
    return list(rows)
```

---

### Backend — Wire deductions into SMS service

In `backend/app/services/sms_service.py`, before every real SMS send, add:

```python
from app.services.wallet_service import deduct, InsufficientBalanceError
from app.services.plan_service import get_credit_rate

# Inside the function that dispatches a single SMS (called per-message in the Celery task):
async def _charge_and_send_sms(db, org_id, to, message, campaign_id):
    rate = await get_credit_rate(db, "sms")
    if rate is None:
        raise RuntimeError("SMS credit rate not configured")
    cost_paisa = int(rate.rate_bdt * 100)

    try:
        await deduct(db, org_id, cost_paisa, service="sms", units=1, reference_id=str(campaign_id))
    except InsufficientBalanceError as e:
        # Don't send — record failure reason
        raise RuntimeError(f"Insufficient balance: {e}") from e

    await db.commit()  # commit deduction BEFORE sending — avoids double-charge on retry
    return await sslwireless_client.send_sms(db=db, to=to, message=message)
```

If `InsufficientBalanceError` is raised:
- Mark the individual SMS event as `status="failed"`, `error="insufficient_balance"`
- Do NOT stop the whole campaign — skip that send, continue to next recipient
- After the campaign finishes, if >50% of sends failed due to balance → mark campaign failed

For email overage, in `backend/app/services/campaign_service.py`:

```python
from app.services.plan_service import get_plan_limit
from app.services.wallet_service import deduct, InsufficientBalanceError

# Count emails sent this calendar month by this org
async def _count_emails_this_month(db, org_id) -> int:
    from sqlalchemy import func, extract
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    result = await db.scalar(
        select(func.count(Event.id))
        .join(Campaign)
        .where(
            Campaign.organization_id == org_id,
            Event.type == EventType.SENT,
            extract("year",  Event.created_at) == now.year,
            extract("month", Event.created_at) == now.month,
        )
    )
    return result or 0

# Before each individual email send:
async def _maybe_charge_email_overage(db, org_id, campaign_id):
    limit = await get_plan_limit(db, org_id, "emails_monthly_limit")
    if limit == -1:
        return  # unlimited plan
    sent_this_month = await _count_emails_this_month(db, org_id)
    if sent_this_month < limit:
        return  # within plan — no charge

    # Overage: charge per 1 000 emails (fraction counted as 1 unit of 1 unit)
    rate = await get_credit_rate(db, "email_overage")
    if rate is None:
        return  # no rate configured — allow free overage (admin's choice)
    cost_paisa = int(rate.rate_bdt * 100)  # cost for 1 000 emails

    # We charge per individual email but amortised: rate is per 1000, so per-email = rate/1000
    per_email_paisa = max(1, cost_paisa // 1000)
    try:
        await deduct(db, org_id, per_email_paisa, service="email_overage", units=1,
                     reference_id=str(campaign_id), note="Email overage")
    except InsufficientBalanceError:
        raise RuntimeError("Insufficient balance for email overage")
```

---

### Backend — Top-up API Routes (add to `backend/app/api/v1/billing.py`)

```python
from app.services.wallet_service import get_balance, topup, list_transactions
from app.schemas.billing import WalletRead, TopUpRequest, TopUpResponse, WalletTransactionRead

# Minimum top-up: 100 BDT = 10 000 paisa
TOPUP_MIN_PAISA = 10_000

@router.get("/wallet", response_model=WalletRead)
async def wallet_balance(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    balance_paisa = await get_balance(db, membership.organization_id)
    return WalletRead(
        balance_paisa=balance_paisa,
        balance_bdt=round(balance_paisa / 100, 2),
    )

@router.post("/wallet/topup", response_model=TopUpResponse)
async def initiate_topup(
    body: TopUpRequest,
    membership: OrganizationMember = Depends(get_current_membership),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    amount_paisa = int(body.amount_bdt * 100)
    if amount_paisa < TOPUP_MIN_PAISA:
        raise HTTPException(400, f"Minimum top-up is {TOPUP_MIN_PAISA // 100} BDT")

    tran_id = f"TOPUP-{uuid.uuid4().hex[:16]}"
    # Store pending topup reference (simple: in Redis or a new pending_topups table;
    # easiest: encode org_id+amount in a signed JWT stored as tran_id prefix)
    # For now, encode as "TOPUP-{org_id_hex12}-{amount_paisa}" — parse in IPN
    tran_id = f"TOPUP-{membership.organization_id.hex[:12]}-{amount_paisa}"

    checkout_url = await sslcommerz_client.init_session(
        tran_id=tran_id,
        amount_bdt=int(body.amount_bdt),
        customer_email=user.email,
        success_url=f"{settings.app_base_url}/billing?tab=wallet&topup=success",
        fail_url=f"{settings.app_base_url}/billing?tab=wallet&topup=failed",
        cancel_url=f"{settings.app_base_url}/billing?tab=wallet&topup=cancelled",
        ipn_url=f"{settings.backend_public_url}/v1/billing/wallet/ipn",
        product_name="LeadBangla Credit Top-Up",
    )
    return TopUpResponse(tran_id=tran_id, checkout_url=checkout_url)

@router.post("/wallet/ipn")
async def wallet_ipn(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    tran_id = str(form.get("tran_id", ""))
    val_id  = str(form.get("val_id",  ""))

    if not tran_id.startswith("TOPUP-"):
        raise HTTPException(400, "Not a wallet top-up transaction")

    parts = tran_id.split("-")  # ["TOPUP", org_id_hex12, amount_paisa]
    if len(parts) != 3:
        raise HTTPException(400, "Malformed tran_id")

    is_valid = await sslcommerz_client.validate_transaction(val_id)
    if not is_valid:
        raise HTTPException(400, "Invalid transaction")

    org_id_hex = parts[1]
    amount_paisa = int(parts[2])

    # Resolve org_id — pad hex to 32 chars to form UUID
    from uuid import UUID
    org_id = UUID(org_id_hex.ljust(32, "0"))  # padded hex trick; see note below

    # Better approach: store a PendingTopUp row in DB (optional improvement)
    await topup(db, org_id, amount_paisa, tran_id)
    await db.commit()
    return {"status": "ok"}

# Dev: fake top-up checkout (same pattern as /billing/fake-checkout)
@router.get("/wallet/fake-checkout", response_class=HTMLResponse)
async def wallet_fake_checkout(tran_id: str):
    parts = tran_id.split("-")
    amount_bdt = int(parts[2]) // 100 if len(parts) == 3 else "?"
    return HTMLResponse(f"""<html><body>
        <h1>Sandbox wallet top-up</h1>
        <p>Amount: {amount_bdt} BDT</p>
        <form method="post" action="/api/v1/billing/wallet/fake-checkout/complete">
          <input type="hidden" name="tran_id" value="{tran_id}" />
          <button type="submit">Simulate successful top-up</button>
        </form></body></html>""")

@router.post("/wallet/fake-checkout/complete")
async def wallet_fake_complete(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    tran_id = str(form.get("tran_id", ""))
    parts = tran_id.split("-")
    org_id_hex = parts[1]
    amount_paisa = int(parts[2])
    from uuid import UUID
    org_id = UUID(org_id_hex.ljust(32, "0"))
    await topup(db, org_id, amount_paisa, tran_id)
    await db.commit()
    return RedirectResponse(
        url=f"{settings.app_base_url}/billing?tab=wallet&topup=success",
        status_code=303,
    )

# Note on org_id encoding: the TOPUP- tran_id approach above is a simple dev
# shortcut. For production, replace with a pending_topups DB table:
# - Create a PendingTopUp row (org_id, amount_paisa, tran_id) before redirecting
# - In IPN, look up by tran_id to get org_id — eliminates the hex padding hack

@router.get("/wallet/transactions", response_model=list[WalletTransactionRead])
async def wallet_transactions(
    limit: int = 50,
    offset: int = 0,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await list_transactions(db, membership.organization_id, limit, offset)
```

**Add to `backend/app/schemas/billing.py`:**

```python
class WalletRead(BaseModel):
    balance_paisa: int
    balance_bdt: float

class TopUpRequest(BaseModel):
    amount_bdt: float   # minimum 100

class TopUpResponse(BaseModel):
    tran_id: str
    checkout_url: str

class WalletTransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    type: str
    amount_paisa: int
    balance_after_paisa: int
    service: str | None
    units_consumed: int | None
    reference_id: str | None
    note: str | None
    created_at: datetime

    @property
    def amount_bdt(self) -> float:
        return self.amount_paisa / 100

    @property
    def balance_after_bdt(self) -> float:
        return self.balance_after_paisa / 100
```

**DoD:** tenant initiates a 200 BDT top-up → fake checkout → balance shows 2.00 BDT... no, 200.00 BDT; sends 5 SMS → balance drops to 195.00 BDT; `GET /v1/billing/wallet/transactions` returns 6 rows (1 top-up + 5 deductions); sending SMS with 0 balance returns a failed event, not a 500.

---

## Step 24 — Plan Usage Enforcement

**Phase:** 6c · **Depends on:** Step 22  
**No new migration needed.**

### Goal

Enforce plan limits at the service layer. Any attempt to exceed a limit returns HTTP
402 with a structured error body so the frontend can show an upgrade prompt.

---

### Backend — `PlanLimitError` exception (`backend/app/core/exceptions.py`)

```python
class PlanLimitError(Exception):
    def __init__(self, resource: str, current: int, limit: int):
        self.resource = resource
        self.current = current
        self.limit = limit
        super().__init__(f"{resource} limit reached ({current}/{limit})")
```

Register a global exception handler in `backend/app/main.py`:

```python
from app.core.exceptions import PlanLimitError

@app.exception_handler(PlanLimitError)
async def plan_limit_handler(request, exc: PlanLimitError):
    return JSONResponse(
        status_code=402,
        content={
            "error": "plan_limit_reached",
            "resource": exc.resource,
            "current": exc.current,
            "limit": exc.limit,
            "upgrade_url": "/billing?tab=plan",
        },
    )
```

---

### Backend — Add limit checks to existing services

**Contacts** — in `backend/app/services/audience_service.py`, find the function that
creates a contact. Add at the top:

```python
from app.services.plan_service import get_plan_limit
from app.core.exceptions import PlanLimitError
from sqlalchemy import func

# Inside create_contact():
limit = await get_plan_limit(db, org_id, "contacts_limit")
if limit != -1:
    count = await db.scalar(
        select(func.count(Contact.id)).where(Contact.organization_id == org_id)
    )
    if (count or 0) >= limit:
        raise PlanLimitError("contacts", count, limit)
```

**Workflows** — in `backend/app/services/workflow_service.py`, find workflow creation:

```python
limit = await get_plan_limit(db, org_id, "workflows_limit")
if limit != -1:
    count = await db.scalar(select(func.count(Workflow.id)).where(Workflow.organization_id == org_id))
    if (count or 0) >= limit:
        raise PlanLimitError("workflows", count, limit)
```

**Landing pages** — in `backend/app/services/landing_page_service.py`:

```python
limit = await get_plan_limit(db, org_id, "landing_pages_limit")
if limit != -1:
    count = await db.scalar(select(func.count(LandingPage.id)).where(LandingPage.organization_id == org_id))
    if (count or 0) >= limit:
        raise PlanLimitError("landing_pages", count, limit)
```

**Team members** — in `backend/app/services/onboarding_service.py`, find the function
that creates an OrganizationMember invite/join:

```python
limit = await get_plan_limit(db, org_id, "team_members_limit")
if limit != -1:
    count = await db.scalar(select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org_id))
    if (count or 0) >= limit:
        raise PlanLimitError("team_members", count, limit)
```

---

### Backend — Plan usage endpoint (add to `backend/app/api/v1/billing.py`)

```python
@router.get("/plan-usage")
async def plan_usage(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    org_id = membership.organization_id
    plan = await get_org_plan(db, org_id)

    contacts_count = await db.scalar(select(func.count(Contact.id)).where(Contact.organization_id == org_id)) or 0
    workflows_count = await db.scalar(select(func.count(Workflow.id)).where(Workflow.organization_id == org_id)) or 0
    lp_count = await db.scalar(select(func.count(LandingPage.id)).where(LandingPage.organization_id == org_id)) or 0
    team_count = await db.scalar(select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org_id)) or 0
    emails_sent = await _count_emails_this_month(db, org_id)
    wallet = await get_balance(db, org_id)

    return {
        "plan_name": plan.name if plan else "No plan",
        "plan_price_bdt": plan.price_bdt if plan else 0,
        "contacts":       {"used": contacts_count,  "limit": plan.contacts_limit if plan else 0},
        "emails_monthly": {"used": emails_sent,      "limit": plan.emails_monthly_limit if plan else 0},
        "workflows":      {"used": workflows_count,  "limit": plan.workflows_limit if plan else 0},
        "landing_pages":  {"used": lp_count,         "limit": plan.landing_pages_limit if plan else 0},
        "team_members":   {"used": team_count,        "limit": plan.team_members_limit if plan else 0},
        "seo_credits":    {"used": 0,                 "limit": plan.seo_credits_monthly if plan else 0},
        "wallet_balance_bdt": wallet / 100,
        "wallet_balance_paisa": wallet,
    }
```

---

### Frontend — Upgrade prompt component (`main-app/src/components/UpgradeLimitModal.tsx`)

```tsx
interface Props {
  resource: string;    // "contacts" | "workflows" | etc.
  current: number;
  limit: number;
  onClose: () => void;
}

export default function UpgradeLimitModal({ resource, current, limit, onClose }: Props) {
  const labels: Record<string, string> = {
    contacts: "Contacts", workflows: "Workflows", landing_pages: "Landing Pages",
    team_members: "Team Members", emails_monthly: "Monthly Emails",
  };
  const label = labels[resource] ?? resource;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-warning-50 flex items-center justify-center">
            <Lock size={18} className="text-warning-500" />
          </div>
          <h3 className="font-bold text-surface-900">{label} limit reached</h3>
        </div>
        <p className="text-sm text-surface-600 mb-5">
          You've used {current.toLocaleString()} of {limit.toLocaleString()} {label.toLowerCase()} on your current plan.
          Upgrade to unlock more.
        </p>
        <div className="flex gap-2">
          <a href="/billing?tab=plan"
            className="flex-1 text-center py-2 px-4 rounded-md bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600">
            Upgrade Plan
          </a>
          <button onClick={onClose}
            className="py-2 px-4 rounded-md border border-surface-200 text-sm text-surface-600 hover:bg-surface-50">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Usage pattern in any module that creates a resource:**

```tsx
const [limitError, setLimitError] = useState<{resource:string; current:number; limit:number} | null>(null);

// In the submit handler:
const res = await fetch("/api/v1/contacts", { method: "POST", ... });
if (res.status === 402) {
  const err = await res.json();
  setLimitError({ resource: err.resource, current: err.current, limit: err.limit });
  return;
}

// In JSX:
{limitError && <UpgradeLimitModal {...limitError} onClose={() => setLimitError(null)} />}
```

Apply this pattern to: ContactsPage, WorkflowsPage, LandingPagesPage, any team invite flow.

**DoD:** a Starter-plan org with 2 000 contacts tries to add one more contact → 402 response → `UpgradeLimitModal` appears with "Upgrade Plan" button; after admin changes the plan's contacts_limit to 5 000, the same org can add contacts again.

---

## Step 25 — Main App: Billing Page

**Phase:** 6d · **Depends on:** Steps 22, 23, 24

### Goal

Build the unified `/billing` page in the main app — one place for plan info, credit
wallet, and payment history.

---

### Frontend — `main-app/src/modules/billing/BillingPage.tsx`

Four tabs managed by `?tab=` query param (default: `plan`):

**Tab: My Plan**

Fetch `GET /api/v1/billing/plan-usage`.

- Plan name as heading; price BDT/month as subtitle
- Grid of usage bars (one per resource):
  - Bar fills proportionally: `(used / limit) * 100%`
  - Color: green `< 70%`, yellow `70–90%`, red `> 90%`
  - Label: "Contacts 1 234 / 2 000" or "Contacts 1 234 / Unlimited" when limit = -1
  - Resources to show: Contacts · Monthly Emails · Workflows · Landing Pages · Team Members · SEO Credits
- Two feature badges: "Custom Domain: ✓ Included" or "Custom Domain: ✗ Not included"
- "Upgrade Plan" button → `/pick-plan`
- "Cancel Subscription" link → shows a confirmation step before calling an endpoint

**Tab: Credit Wallet**

Fetch `GET /api/v1/billing/wallet`.

- Large balance display: "BDT 245.00" in large font with currency label
- Low balance warning banner: shown when balance < 50 BDT (5 000 paisa)
  - "Your balance is low. Top up to keep SMS and email sends uninterrupted."
  - "Top Up Now" CTA button inside the banner
- Quick top-up amounts row: `[100 BDT]  [250 BDT]  [500 BDT]  [1 000 BDT]  [Custom]`
  - Clicking any preset or entering custom amount → `POST /api/v1/billing/wallet/topup` → redirect to `checkout_url`
- Current credit rates table (fetch `GET /api/v1/billing/credit-rates` — add this public endpoint):
  - SMS: 1.00 BDT/message · WhatsApp: 5.00 BDT/conversation · Email overage: 8.00 BDT/1 000 emails · SEO: 2.00 BDT/query

**Tab: Transaction History**

Fetch `GET /api/v1/billing/wallet/transactions`.

Table columns: Date | Type | Description | Amount (BDT) | Balance after (BDT)

- Type badges: "Top-up" (green) · "SMS" (blue) · "Email" (purple) · "WhatsApp" (teal) · "SEO" (orange) · "Admin" (gray)
- Amount: green for top-ups ("+200.00"), red for deductions ("-1.00")
- Paginate with "Load more" button (offset-based)
- Empty state: "No transactions yet. Top up your wallet to get started."

**Tab: Invoices**

Fetch `GET /api/v1/billing/me` for subscription.

- Subscription payment card: plan name, amount, date, status badge
- Note: "Full invoice PDF generation coming soon — contact support for a VAT invoice."

---

### Frontend — Nav update (`main-app/src/components/AppLayout.tsx`)

Add a new "Account" nav group between "Growth" and the bottom bar:

```typescript
{
  label: "Account",
  items: [
    { to: "/billing",  label: "Billing",  icon: <CreditCard size={16} /> },
    { to: "/settings", label: "Settings", icon: <Settings size={16} /> },
  ],
},
```

Remove `/settings` from wherever it currently appears as a standalone bottom-bar link.

---

### Frontend — App.tsx

```tsx
import BillingPage from "./modules/billing/BillingPage";
<Route path="/billing" element={<BillingPage />} />
```

The existing `/billing/success` and `/billing/cancel` routes stay unchanged.

---

### Frontend — `main-app/src/lib/billing.ts` (extend existing analytics lib pattern)

```typescript
export interface PlanUsage {
  plan_name: string; plan_price_bdt: number;
  contacts:       { used: number; limit: number };
  emails_monthly: { used: number; limit: number };
  workflows:      { used: number; limit: number };
  landing_pages:  { used: number; limit: number };
  team_members:   { used: number; limit: number };
  seo_credits:    { used: number; limit: number };
  wallet_balance_bdt: number; wallet_balance_paisa: number;
}
export interface WalletTxn {
  id: string; type: string; amount_paisa: number; balance_after_paisa: number;
  service: string | null; units_consumed: number | null; reference_id: string | null;
  note: string | null; created_at: string;
}
export interface CreditRate { service: string; rate_bdt: string; unit_label: string; }

export async function fetchPlanUsage(): Promise<PlanUsage>
export async function fetchWalletBalance(): Promise<{ balance_paisa: number; balance_bdt: number }>
export async function initiateTopup(amount_bdt: number): Promise<{ tran_id: string; checkout_url: string }>
export async function fetchTransactions(limit?: number, offset?: number): Promise<WalletTxn[]>
export async function fetchCreditRates(): Promise<CreditRate[]>
```

**Add public endpoint** to `backend/app/api/v1/billing.py` (no auth required):

```python
@router.get("/credit-rates", response_model=list[CreditRateRead])
async def public_credit_rates(db: AsyncSession = Depends(get_db)):
    return await list_credit_rates(db)
```

**DoD:** `/billing` page loads showing correct plan name, usage bars at seed-data
values; "Top Up 200 BDT" → fake checkout → returns to `/billing?tab=wallet&topup=success`
with balance showing 200.00 BDT; Transaction History tab shows the top-up entry.

---

## Step 26 — Admin: Wallet Oversight & Revenue Dashboard

**Phase:** 6e · **Depends on:** Steps 23, 25

### Goal

Admin panel pages to see all tenant wallet balances, adjust them, and view revenue.

---

### Backend — Admin wallet routes (add to `backend/app/api/v1/admin.py`)

```python
from app.services.wallet_service import get_balance, admin_adjust, list_transactions
from app.models.wallet import OrgWallet, WalletTransaction

@router.get("/wallets")
async def admin_list_wallets(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns all org wallets with org name and last topup."""
    rows = await db.execute(
        select(OrgWallet, Organization.name)
        .join(Organization, OrgWallet.organization_id == Organization.id)
        .order_by(OrgWallet.balance_paisa)
    )
    return [
        {
            "org_id": str(w.organization_id),
            "org_name": name,
            "balance_bdt": round(w.balance_paisa / 100, 2),
            "balance_paisa": w.balance_paisa,
            "low_balance_threshold_bdt": w.low_balance_threshold_paisa / 100,
            "is_low": w.balance_paisa < w.low_balance_threshold_paisa,
            "updated_at": w.updated_at.isoformat() if w.updated_at else None,
        }
        for w, name in rows.all()
    ]

@router.get("/wallets/{org_id}/transactions")
async def admin_wallet_transactions(
    org_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    txns = await list_transactions(db, org_id, limit, offset)
    return [
        {
            "id": str(t.id), "type": t.type, "amount_bdt": round(t.amount_paisa / 100, 2),
            "balance_after_bdt": round(t.balance_after_paisa / 100, 2),
            "service": t.service, "units_consumed": t.units_consumed,
            "reference_id": t.reference_id, "note": t.note,
            "created_at": t.created_at.isoformat(),
        }
        for t in txns
    ]

@router.post("/wallets/{org_id}/adjust")
async def admin_adjust_wallet(
    org_id: uuid.UUID,
    body: dict,   # { "amount_bdt": float, "note": str }
    user: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    amount_paisa = int(float(body["amount_bdt"]) * 100)
    txn = await admin_adjust(db, org_id, amount_paisa, body.get("note", ""), user.email)
    await db.commit()
    return {"balance_after_bdt": round(txn.balance_after_paisa / 100, 2)}
```

**Revenue summary** (add to admin routes):

```python
@router.get("/revenue/summary")
async def revenue_summary(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    from sqlalchemy import extract

    now = datetime.now(timezone.utc)

    # MRR from active subscriptions
    plan_rows = await db.execute(
        select(Plan.price_bdt, func.count(Subscription.id))
        .join(Subscription, Subscription.plan_id == Plan.id)
        .where(Subscription.status == SubscriptionStatus.ACTIVE)
        .group_by(Plan.price_bdt)
    )
    mrr_bdt = sum(price * count for price, count in plan_rows.all())

    # Credit top-up revenue this month
    topup_revenue = await db.scalar(
        select(func.sum(WalletTransaction.amount_paisa))
        .where(
            WalletTransaction.type == "topup",
            extract("year", WalletTransaction.created_at) == now.year,
            extract("month", WalletTransaction.created_at) == now.month,
        )
    ) or 0

    # Total wallet float (liability)
    total_float = await db.scalar(select(func.sum(OrgWallet.balance_paisa))) or 0

    # Active subscriptions count
    active_subs = await db.scalar(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
    ) or 0

    # Per-service credit consumption this month
    service_rows = await db.execute(
        select(WalletTransaction.service, func.sum(func.abs(WalletTransaction.amount_paisa)))
        .where(
            WalletTransaction.type == "deduction",
            extract("year", WalletTransaction.created_at) == now.year,
            extract("month", WalletTransaction.created_at) == now.month,
            WalletTransaction.service.is_not(None),
        )
        .group_by(WalletTransaction.service)
    )
    service_spend = {svc: paisa / 100 for svc, paisa in service_rows.all()}

    return {
        "mrr_bdt": mrr_bdt,
        "credit_topup_revenue_bdt": round(topup_revenue / 100, 2),
        "total_float_bdt": round(total_float / 100, 2),
        "active_subscriptions": active_subs,
        "credit_consumption_bdt": service_spend,  # {sms: 45.0, email_overage: 8.0, ...}
    }
```

---

### Admin Panel — Wallets Page (`frontend/admin-panel/src/wallets/WalletsPage.tsx`)

Route: `/wallets`

Layout:
- Stats strip: Total float held: BDT X · Low-balance tenants: N · Active subscriptions: N
- Filter pill: "All" / "Low Balance" (balance < threshold)
- Table: Org Name | Balance (BDT) | Threshold (BDT) | Status | Last Updated | Actions
  - Status badge: "Low" (red) or "OK" (green)
  - Actions: "Adjust" button → modal (amount + note, can be positive or negative) + "View History" link
- Click "View History" → expands inline (or separate page `/wallets/:orgId`) showing transaction table

---

### Admin Panel — Revenue Page (`frontend/admin-panel/src/revenue/RevenuePage.tsx`)

Route: `/revenue`

Layout:

**KPI strip (4 cards):**
- MRR (BDT) from subscriptions
- Credit revenue this month (BDT top-ups received)
- Total float held (BDT — liability to tenants)
- Active subscriptions count

**Two-column row:**
- Left — "Plan Distribution" — bar per plan: `plan_name: N tenants · BDT X MRR`
  Simple CSS bars, no charting library. Each bar width proportional to tenant count.
- Right — "Credit Consumption This Month" — bar per service: SMS · WhatsApp · Email Overage · SEO
  Each bar width proportional to BDT amount consumed.

**Full-width — Recent Transactions (last 50):**
Table: Date | Org | Type (Plan renewal / Wallet top-up / Admin adjustment) | Amount (BDT) | Service

---

### Admin Panel — Nav update (`AppLayout.tsx`)

```tsx
<Link to="/plans">Plans & Rates</Link>
<Link to="/wallets">Wallets</Link>
<Link to="/revenue">Revenue</Link>
<Link to="/tenants">Tenants</Link>
```

Add routes to `App.tsx`:
```tsx
import WalletsPage  from "./wallets/WalletsPage";
import RevenuePage  from "./revenue/RevenuePage";
<Route path="/wallets"  element={<WalletsPage />} />
<Route path="/revenue"  element={<RevenuePage />} />
```

**DoD:** admin can see all wallet balances; manually adds 50 BDT to a demo tenant → balance updates immediately → visible in tenant's `/billing?tab=wallet`; Revenue page shows correct MRR from seeded subscriptions.

---

## Step 27 — Integration Hub (Admin — Platform Service Credentials)

**Phase:** 6f · **Depends on:** Steps 22–26  
**Migration:** `0019_create_platform_services.py`

### Goal

Centralize all platform-level API credentials (SendGrid, SSL Wireless, SSLCommerz,
Meta, LinkedIn, Firebase, DataForSEO, Twitter/X) in the DB with an admin UI to
configure them, instead of hardcoded env vars.

---

### Backend — Migration `0019`

```python
revision = "0019"
down_revision = "0018"

def upgrade():
    op.create_table(
        "platform_services",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("docs_url", sa.String(300), nullable=True),
        sa.Column("cost_model", sa.String(200), nullable=True),
        sa.Column("est_monthly_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_live", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("credentials_enc", sa.Text(), nullable=True),  # Fernet ciphertext
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_ok", sa.Boolean(), nullable=True),
        sa.Column("last_test_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    # Seed all 8 services
    op.execute("""
        INSERT INTO platform_services (id, code, name, category, description, docs_url, cost_model, est_monthly_usd) VALUES
        (gen_random_uuid(),'sslcommerz','SSLCommerz','payment',
         'Payment gateway for BDT subscriptions and wallet top-ups (cards, bKash, Nagad, Rocket, Upay)',
         'https://developer.sslcommerz.com/doc/v4/','~2.5–3.5% + VAT per transaction',0),
        (gen_random_uuid(),'sendgrid','SendGrid Email','email',
         'Transactional and campaign email delivery',
         'https://docs.sendgrid.com/api-reference/','Free 100/day; $19.95/mo Essentials (50K emails)',20),
        (gen_random_uuid(),'sslwireless','SSL Wireless SMS','sms',
         'BTRC-recognized SMS and WhatsApp BSP for Bangladesh market',
         'https://sms.sslwireless.com/pushapi/','~0.30–0.50 BDT/SMS (variable)',0),
        (gen_random_uuid(),'meta_social','Meta Graph API','social',
         'Facebook and Instagram page post publishing and stats',
         'https://developers.facebook.com/docs/graph-api/','Free',0),
        (gen_random_uuid(),'linkedin','LinkedIn Marketing API','social',
         'LinkedIn organization post publishing (requires MDP approval)',
         'https://learn.microsoft.com/en-us/linkedin/marketing/','Free',0),
        (gen_random_uuid(),'firebase_vapid','Firebase / VAPID Push','push',
         'Web push notifications via VAPID protocol (FCM-backed)',
         'https://firebase.google.com/docs/cloud-messaging','Free',0),
        (gen_random_uuid(),'dataseo','DataForSEO','seo',
         'Rank tracking, SERP data, and backlink analysis',
         'https://docs.dataforseo.com/','~$50–300/mo usage-based',150),
        (gen_random_uuid(),'twitter_x','Twitter / X API','social',
         'Tweet publishing via X API Basic tier',
         'https://developer.twitter.com/en/docs/twitter-api','$200/mo Basic tier',200)
        ON CONFLICT (code) DO NOTHING
    """)
```

---

### Backend — Credential encryption (`backend/app/core/cred_crypto.py`)

```python
import os, base64, json
from cryptography.fernet import Fernet

def _get_key() -> bytes:
    key = os.environ.get("SERVICE_CRED_KEY", "")
    if not key:
        # Dev fallback: derive from JWT_SECRET (not safe for production)
        from app.core.config import settings
        import hashlib
        raw = hashlib.sha256(settings.jwt_secret.encode()).digest()
        key = base64.urlsafe_b64encode(raw).decode()
    return key.encode()

def encrypt_creds(data: dict) -> str:
    f = Fernet(_get_key())
    return f.encrypt(json.dumps(data).encode()).decode()

def decrypt_creds(ciphertext: str) -> dict:
    f = Fernet(_get_key())
    return json.loads(f.decrypt(ciphertext.encode()).decode())
```

Add `SERVICE_CRED_KEY` to `.env`:
```
SERVICE_CRED_KEY=   # generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

### Backend — Platform service model & reader (`backend/app/models/platform_service.py`)

```python
class PlatformService(Base):
    __tablename__ = "platform_services"
    id, code, name, category, description, docs_url, cost_model, est_monthly_usd
    is_enabled: bool; is_live: bool
    credentials_enc: str | None   # Fernet ciphertext of JSON dict; NEVER returned to client
    last_tested_at, last_test_ok, last_test_error, created_at, updated_at
```

`backend/app/core/service_creds.py`:

```python
async def get_live_creds(db, code: str) -> dict | None:
    """Returns decrypted credentials if service is enabled, live, and has creds.
    Falls back to env var if cred is not in DB but env var is not placeholder."""
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc and svc.is_enabled and svc.is_live and svc.credentials_enc:
        return decrypt_creds(svc.credentials_enc)
    # Env var fallback (backwards compatibility)
    return _env_fallback(code)

def _env_fallback(code: str) -> dict | None:
    from app.core.config import settings
    if code == "sendgrid" and not settings.sendgrid_is_fake:
        return {"api_key": settings.sendgrid_api_key, "from_email": settings.sendgrid_from_email}
    if code == "sslwireless" and not settings.sslwireless_is_fake:
        return {"api_token": settings.sslwireless_api_token, "sender_id": settings.sslwireless_sender_id}
    # ... etc for other services
    return None
```

---

### Backend — Admin integration routes (add to `backend/app/api/v1/admin.py`)

```python
# Credential fields expected per service code (for frontend reference — not enforced backend-side)
@router.get("/integrations")
async def list_integrations(_=Depends(get_current_internal_user), db=Depends(get_db)):
    svcs = await db.scalars(select(PlatformService).order_by(PlatformService.category))
    return [_svc_read(s) for s in svcs]

def _svc_read(s: PlatformService) -> dict:
    return {
        "id": str(s.id), "code": s.code, "name": s.name, "category": s.category,
        "description": s.description, "docs_url": s.docs_url,
        "cost_model": s.cost_model, "est_monthly_usd": float(s.est_monthly_usd or 0),
        "is_enabled": s.is_enabled, "is_live": s.is_live,
        "has_credentials": s.credentials_enc is not None,
        "last_tested_at": s.last_tested_at.isoformat() if s.last_tested_at else None,
        "last_test_ok": s.last_test_ok, "last_test_error": s.last_test_error,
    }

@router.patch("/integrations/{code}")
async def update_integration(
    code: str, body: dict,
    user=Depends(get_current_internal_user), db=Depends(get_db)
):
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc is None:
        raise HTTPException(404)
    if "credentials" in body and body["credentials"]:
        svc.credentials_enc = encrypt_creds(body["credentials"])
    if "is_enabled" in body: svc.is_enabled = body["is_enabled"]
    if "is_live" in body:    svc.is_live    = body["is_live"]
    if "est_monthly_usd" in body: svc.est_monthly_usd = body["est_monthly_usd"]
    await db.commit()
    await db.refresh(svc)
    return _svc_read(svc)

@router.post("/integrations/{code}/test")
async def test_integration(
    code: str, _=Depends(get_current_internal_user), db=Depends(get_db)
):
    from app.services.integration_test_service import test_service
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc is None or not svc.credentials_enc:
        return {"ok": False, "message": "No credentials stored", "tested_at": None}
    creds = decrypt_creds(svc.credentials_enc)
    ok, message = await test_service(code, creds)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    svc.last_tested_at = now; svc.last_test_ok = ok; svc.last_test_error = message if not ok else None
    await db.commit()
    return {"ok": ok, "message": message, "tested_at": now.isoformat()}

@router.delete("/integrations/{code}/credentials", status_code=204)
async def clear_credentials(code: str, _=Depends(get_current_internal_user), db=Depends(get_db)):
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc:
        svc.credentials_enc = None; svc.is_live = False
        await db.commit()
```

---

### Backend — Connectivity test service (`backend/app/services/integration_test_service.py`)

```python
import httpx

async def test_service(code: str, creds: dict) -> tuple[bool, str]:
    try:
        if code == "sendgrid":
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get("https://api.sendgrid.com/v3/user/credits",
                                headers={"Authorization": f"Bearer {creds['api_key']}"})
            return r.status_code == 200, f"HTTP {r.status_code}"

        if code == "sslwireless":
            # A request with blank msisdn returns an error but proves the token is accepted
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post("https://sms.sslwireless.com/pushapi/dynamic/server.php",
                                 data={"api_token": creds["api_token"], "sid": creds["sender_id"],
                                       "msisdn": "test", "sms": "ping", "csmsid": "test-ping"})
            return r.status_code < 500, f"HTTP {r.status_code}"

        if code == "meta_social":
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get("https://graph.facebook.com/v19.0/me",
                                params={"fields": "id", "access_token": creds["access_token"]})
            return r.status_code == 200, r.json().get("id", f"HTTP {r.status_code}")

        if code == "linkedin":
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get("https://api.linkedin.com/v2/me",
                                headers={"Authorization": f"Bearer {creds['access_token']}"})
            return r.status_code == 200, f"HTTP {r.status_code}"

        if code == "dataseo":
            import base64
            token = base64.b64encode(f"{creds['login']}:{creds['password']}".encode()).decode()
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get("https://api.dataforseo.com/v3/appendix/user_data",
                                headers={"Authorization": f"Basic {token}"})
            return r.status_code == 200, f"HTTP {r.status_code}"

        if code == "twitter_x":
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get("https://api.twitter.com/2/users/me",
                                headers={"Authorization": f"Bearer {creds['bearer_token']}"})
            return r.status_code == 200, f"HTTP {r.status_code}"

        if code == "firebase_vapid":
            from cryptography.hazmat.primitives.asymmetric import ec
            # Just verify the keys can be parsed
            import base64
            base64.urlsafe_b64decode(creds["vapid_public_key"] + "==")
            return True, "VAPID keys parsed successfully"

        if code == "sslcommerz":
            # Just verify env/DB connectivity — real test needs a live session which we skip
            return bool(creds.get("store_id")), "Credentials present"

        return False, f"Unknown service: {code}"
    except Exception as e:
        return False, str(e)
```

---

### Admin Panel — Integration Hub (`frontend/admin-panel/src/integrations/IntegrationHubPage.tsx`)

Route: `/integrations` · Nav link: "Integrations"

**Credential fields per service (define in `integrations.ts`):**

```typescript
export const SERVICE_FIELDS: Record<string, { key: string; label: string; type: "text"|"password"; hint?: string }[]> = {
  sendgrid:      [{ key:"api_key", label:"API Key", type:"password", hint:"Starts with SG." },
                  { key:"from_email", label:"From Email", type:"text" }],
  sslcommerz:    [{ key:"store_id", label:"Store ID", type:"text" },
                  { key:"store_password", label:"Store Password", type:"password" },
                  { key:"sandbox_base_url", label:"Base URL", type:"text",
                    hint:"https://sandbox.sslcommerz.com or https://securepay.sslcommerz.com" }],
  sslwireless:   [{ key:"api_token", label:"API Token", type:"password" },
                  { key:"sender_id", label:"Sender ID", type:"text" }],
  meta_social:   [{ key:"access_token", label:"Page Access Token", type:"password" },
                  { key:"page_id", label:"Facebook Page ID", type:"text" }],
  linkedin:      [{ key:"access_token", label:"Access Token", type:"password" },
                  { key:"org_urn", label:"Org URN", type:"text", hint:"urn:li:organization:XXXXXXXX" }],
  firebase_vapid:[{ key:"vapid_public_key", label:"VAPID Public Key", type:"text" },
                  { key:"vapid_private_key", label:"VAPID Private Key", type:"password" },
                  { key:"vapid_subject", label:"VAPID Subject", type:"text", hint:"mailto:admin@example.com" }],
  dataseo:       [{ key:"login", label:"Login (email)", type:"text" },
                  { key:"password", label:"Password", type:"password" }],
  twitter_x:     [{ key:"bearer_token", label:"Bearer Token", type:"password" },
                  { key:"api_key", label:"API Key", type:"password" },
                  { key:"api_secret", label:"API Secret", type:"password" }],
};
```

**Page layout:**
- Estimated monthly cost strip at top: "Platform services estimated cost: $370/mo"
  (sum of `est_monthly_usd` for is_live=true services)
- Service cards grid grouped by category (Payment / Email / SMS / Social / Push / SEO)
- Each card:
  - Service name + category badge
  - Status badge: "Live" (green) / "Sandbox" (yellow) / "Unconfigured" (gray) / "Disabled" (slate)
  - Est. cost: "$19.95/mo" or "Free"
  - Last tested: "✓ 2h ago" or "✗ 3d ago (error msg)" or "Never"
  - "Configure" button + "Test" button
- "Configure" modal: renders `SERVICE_FIELDS[code]` dynamically; "Save" → PATCH; "Go Live" toggle; "Disable" toggle; "Clear Credentials" danger button
- "Test" button → POST test → spinner → shows result inline on the card

**DoD:** admin enters real SendGrid API key, clicks Save → card shows "Unconfigured" → "Configured"; clicks "Go Live" → card shows "Live"; clicks "Test" → shows "✓ HTTP 200"; subsequent email campaigns route through real SendGrid.

---

## Step 28 — Connected Accounts Hub (Main App)

**Phase:** 6g · **Depends on:** Steps 22–27

### Goal

One place in the main app where a customer can see all their connected third-party
accounts (social pages, ad accounts) and the platform service status.

---

### Frontend — `main-app/src/modules/settings/ConnectionsPage.tsx`

Route: `/settings/connections` (or add as a tab to existing Settings if one exists)

Three sections:

**Section 1: Social Accounts**

Read from existing social platform connection data (whatever the Social module uses).
Display each connected account as a card:
- Platform icon + name (Facebook / Instagram / LinkedIn / Twitter/X)
- Account name / page name
- Token status: "Active" (green) / "Expired — reconnect" (red) / "Not connected" (gray)
- "Connect" button → OAuth flow (existing flow from Social module, just linked here)
- "Disconnect" → DELETE existing social account endpoint

If the platform has Twitter/X disabled (`is_live=false` in PlatformService), show the
Twitter/X card grayed out with note: "Not available on your platform yet."

**Section 2: Ad Accounts**

Read from existing `GET /v1/paid-ads/accounts` endpoint.
Show Google Ads and Meta Ads accounts already connected.
"Manage Ad Accounts" link → `/paid-ads`.

**Section 3: Platform Services Status (read-only)**

Fetch `GET /v1/platform/status` (new public endpoint — returns service status without credentials):

```python
# backend/app/api/v1/billing.py or a new platform.py
@router.get("/platform/status")
async def platform_status(db: AsyncSession = Depends(get_db)):
    svcs = await db.scalars(select(PlatformService).where(PlatformService.is_enabled.is_(True)))
    return [
        {
            "category": s.category,
            "name": s.name,
            "status": "live" if (s.is_live and s.credentials_enc) else
                      ("sandbox" if s.is_enabled else "disabled"),
            "note": None if (s.is_live and s.credentials_enc) else
                    ("Sandbox mode — sends are simulated" if s.is_enabled else "Contact support to activate"),
        }
        for s in svcs
    ]
```

Display as a clean list:
```
Email (SendGrid)        ● Live
SMS (SSL Wireless)      ◐ Sandbox — Sends are simulated
Facebook / Instagram    ● Live
LinkedIn               ◐ Sandbox
Push Notifications      ● Live
SEO Data               ○ Not configured
Twitter / X            ○ Not configured — Contact support
```

No controls here — read-only. Note at bottom: "To enable a service, contact your platform admin."

**Add to nav in AppLayout.tsx:**

```typescript
{ to: "/settings/connections", label: "Connections", icon: <Link2 size={16} /> },
```

under the existing "Account" group.

**DoD:** customer visits `/settings/connections`, sees their connected Facebook page and Google Ads account; platform status shows SMS as "Sandbox"; reconnecting an expired LinkedIn token works from this page.

---

## Step 29 — Low-Balance & Usage Alerts

**Phase:** 6h · **Depends on:** Steps 23, 28  
**Migration:** `0020_create_notification_settings.py`

### Goal

Daily Celery task checks all org wallets and plan usage. Sends email warnings when
balance is low or usage is near the limit.

---

### Backend — Migration `0020`

```python
revision = "0020"
down_revision = "0019"

def upgrade():
    op.create_table(
        "org_notification_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("low_balance_alert", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("usage_limit_alert", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("low_balance_threshold_bdt", sa.Numeric(10, 2), nullable=False, server_default="50"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
```

---

### Backend — Daily alert task (add to `backend/app/workers/tasks.py`)

```python
@celery_app.task(name="check_wallet_and_usage_alerts")
def check_wallet_and_usage_alerts_task():
    import asyncio
    asyncio.run(_run_alerts())

async def _run_alerts():
    from app.core.db import async_session_factory
    from app.models.organization import Organization
    from app.models.wallet import OrgWallet
    from app.services.wallet_service import get_balance
    from app.services.plan_service import get_plan_limit
    from app.integrations.sendgrid import sendgrid_client

    async with async_session_factory() as db:
        orgs = list(await db.scalars(select(Organization)))
        for org in orgs:
            await _check_org_alerts(db, org, sendgrid_client)

async def _check_org_alerts(db, org, sendgrid):
    # Get owner email
    from app.models.organization import OrganizationMember
    from app.models.user import User
    from app.models.enums import TenantRole
    owner_member = await db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.role == TenantRole.OWNER,
        )
    )
    if not owner_member:
        return
    user = await db.get(User, owner_member.user_id)
    if not user:
        return

    # Check wallet balance
    wallet = await db.scalar(select(OrgWallet).where(OrgWallet.organization_id == org.id))
    if wallet and wallet.balance_paisa < wallet.low_balance_threshold_paisa:
        balance_bdt = wallet.balance_paisa / 100
        threshold_bdt = wallet.low_balance_threshold_paisa / 100
        await sendgrid.send_email(
            db=db,
            to_email=user.email,
            subject="Your LeadBangla credit balance is low",
            html_body=f"""
            <p>Your credit wallet balance is <strong>{balance_bdt:.2f} BDT</strong>,
            which is below your alert threshold of {threshold_bdt:.2f} BDT.</p>
            <p>Top up now to keep SMS and email campaigns running uninterrupted.</p>
            <p><a href="https://app.leadbangla.com/billing?tab=wallet">Top Up Now →</a></p>
            """,
        )

    # Check plan usage (> 90% of any limit)
    plan = await get_org_plan(db, org.id)
    if not plan:
        return
    checks = [
        ("contacts", "contacts_limit", Contact),
        ("workflows", "workflows_limit", Workflow),
    ]
    for resource, limit_field, Model in checks:
        limit = getattr(plan, limit_field)
        if limit == -1:
            continue
        count = await db.scalar(select(func.count(Model.id)).where(Model.organization_id == org.id)) or 0
        if count >= int(limit * 0.9):
            await sendgrid.send_email(
                db=db,
                to_email=user.email,
                subject=f"You're close to your {resource} limit on LeadBangla",
                html_body=f"""
                <p>You've used {count:,} of {limit:,} {resource} on your current plan ({plan.name}).</p>
                <p><a href="https://app.leadbangla.com/billing?tab=plan">Upgrade your plan →</a></p>
                """,
            )
```

**Schedule in `celery_app.py` beat config:**

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    "wallet-usage-alerts": {
        "task": "check_wallet_and_usage_alerts",
        "schedule": crontab(hour=9, minute=0),  # daily at 09:00 UTC
    },
}
```

---

### Frontend — Notification preferences in Settings

Add to whatever settings page exists (or a new `/settings` page if one doesn't):

```tsx
// Notification preferences card
<Card>
  <h3>Notification Preferences</h3>
  <ToggleRow
    label="Low balance warning"
    description="Email me when my credit balance drops below threshold"
    checked={prefs.low_balance_alert}
    onChange={(v) => savePref("low_balance_alert", v)}
  />
  <ToggleRow
    label="Usage limit warnings"
    description="Email me when I've used 90% of a plan limit"
    checked={prefs.usage_limit_alert}
    onChange={(v) => savePref("usage_limit_alert", v)}
  />
  <label className="text-sm text-surface-600">
    Low balance alert threshold (BDT)
    <input type="number" min="0" value={prefs.threshold_bdt}
      onChange={(e) => savePref("low_balance_threshold_bdt", +e.target.value)}
      className="ml-2 w-24 border rounded px-2 py-1 text-sm" />
  </label>
</Card>
```

Backend routes for preferences (add to `backend/app/api/v1/billing.py`):

```
GET  /billing/notification-prefs   → current prefs for org
PATCH /billing/notification-prefs  → update prefs
```

**DoD:** running the Celery task manually against a demo org whose wallet is at 30 BDT (< 50 BDT threshold) sends a low-balance alert email to the org owner (visible in SendGrid activity log or captured by the fake send).

---

## Step 30 — Seed Data Update & End-to-End Verification

**Phase:** 6i · **Depends on:** Steps 22–29

### Seed script updates (`backend/app/scripts/seed_demo_data.py`)

Add at the end of the seed function, after existing org/contact creation:

```python
# Wallets — give each demo org a starting balance
from app.services.wallet_service import topup
for org, balance_bdt in [(starter_org, 150), (growth_org, 500)]:
    await topup(db, org.id, amount_paisa=balance_bdt * 100, tran_id=f"SEED-{org.id.hex[:8]}")

# Add some deduction history so transaction history is non-empty
from app.services.wallet_service import deduct
await deduct(db, starter_org.id, cost_paisa=300, service="sms", units=3, reference_id="seed-sms-campaign")
await deduct(db, growth_org.id,  cost_paisa=800, service="email_overage", units=1000, reference_id="seed-email-campaign")

await db.commit()
print("[seed] Wallets: Starter=150 BDT, Growth=500 BDT (with sample transaction history)")
```

### End-to-end verification checklist

Run on a fresh DB: `docker compose down -v && docker compose up -d`, then
`docker compose exec backend alembic upgrade head`, then `docker compose exec backend python -m app.scripts.seed_demo_data`.

**Admin panel checks:**
- [ ] `/plans` — 3 plans shown with correct limits; edit Starter contacts_limit to 3 000 → tenant's `/billing/plan-usage` returns 3 000
- [ ] `/plans` credit rates section — edit SMS rate to 1.20 BDT → next SMS deduction charges 1.20 BDT
- [ ] `/wallets` — Starter org shows 147.00 BDT (150 − 3.00 SMS deduction); Growth shows 492.00 BDT
- [ ] `/wallets` adjust — add 100 BDT to Starter → balance becomes 247.00 BDT → visible in tenant billing page
- [ ] `/revenue` — MRR = sum of active subscription plan prices; Credit revenue = seed top-up amounts
- [ ] `/integrations` — all 8 services listed; enter fake SendGrid key, toggle Live → card shows status

**Main platform checks:**
- [ ] `/billing?tab=plan` — shows plan name, price, usage bars at seed values
- [ ] `/billing?tab=wallet` — shows 247.00 BDT (after admin adjustment); low-balance banner absent
- [ ] Top-up 200 BDT via fake checkout → returns to `/billing?tab=wallet&topup=success` → balance 447.00 BDT
- [ ] Transaction history shows: seed top-up + seed deductions + admin adjustment + fake checkout top-up
- [ ] `/billing?tab=wallet` credit rates table shows SMS 1.20 BDT (after admin rate edit)
- [ ] Create contact until plan limit → `UpgradeLimitModal` appears
- [ ] `/settings/connections` — platform status row shows SMS as Sandbox (is_live=false)

**Service gate checks:**
- [ ] Send SMS campaign with sufficient balance → balance deducted correctly
- [ ] Send SMS campaign with 0 BDT balance → SMS event marked failed with reason "insufficient_balance", campaign continues to other recipients
- [ ] Send email campaign within plan limit → no wallet deduction
- [ ] Send email campaign in overage → wallet deducts per-email fraction
- [ ] Celery low-balance alert task → seeding an org at 30 BDT and running the task → alert email logged (in fake send mode, check the task logs)

---

## Deployment summary

### New environment variable

```env
# .env — add this once for Step 27
SERVICE_CRED_KEY=   # generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Migration chain

```
0017_add_plan_limits_and_credit_rates   (Step 22)
0018_create_wallet_tables               (Step 23)
0019_create_platform_services           (Step 27)
0020_create_notification_settings       (Step 29)
```

Run all at once: `docker compose exec backend alembic upgrade head`

### Hot-patch order per step

For each step:
1. `docker compose cp <new_files> backend:/app/app/...`
2. `docker compose exec backend alembic upgrade head` (if migration in this step)
3. `docker compose restart backend`
4. Rebuild frontend if changed: `docker compose up -d --build main-app admin-panel && docker compose restart proxy`

### Summary: what each panel can now do

| Capability | Admin Panel | Main Platform |
|---|---|---|
| Create / edit plans | ✓ `/plans` | — |
| Set credit rates (SMS, email, SEO) | ✓ `/plans` rates section | — (read-only view) |
| See all wallet balances | ✓ `/wallets` | — |
| Adjust a tenant's wallet | ✓ `/wallets` | — |
| Configure SendGrid / SSL Wireless credentials | ✓ `/integrations` | — |
| Toggle service live / sandbox | ✓ `/integrations` | — |
| View revenue & MRR | ✓ `/revenue` | — |
| Top up own wallet | — | ✓ `/billing?tab=wallet` |
| View plan usage & limits | — | ✓ `/billing?tab=plan` |
| View transaction history | — | ✓ `/billing?tab=wallet` |
| See platform service status | — | ✓ `/settings/connections` |
| Connect own social accounts | — | ✓ `/settings/connections` |
| Connect own ad accounts | — | ✓ `/paid-ads` |
| Set notification preferences | — | ✓ Settings |
