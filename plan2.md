# LeadBangla — Platform Architecture & Payment Model Plan

## 1. Two-Panel Architecture (Clarified)

```
┌─────────────────────────────────────────────────────┐
│              LEADBANGLA (you / the operator)         │
│                                                      │
│  ┌──────────────────────┐   ┌──────────────────────┐│
│  │    ADMIN PANEL       │   │   MAIN PLATFORM      ││
│  │  (internal tool)     │   │  (customer product)  ││
│  │                      │   │                      ││
│  │  • Manage plans      │   │  • Run campaigns     ││
│  │  • Set pricing       │   │  • Send SMS/email    ││
│  │  • Configure APIs    │   │  • Build workflows   ││
│  │  • Watch tenants     │   │  • View analytics    ││
│  │  • Control wallets   │   │  • Top up wallet     ││
│  │  • Revenue view      │   │  • Connect socials   ││
│  │  • Support tools     │   │  • Manage contacts   ││
│  └──────────────────────┘   └──────────────────────┘│
│       (port 5174 / admin subdomain)   (port 80)      │
└─────────────────────────────────────────────────────┘
```

**Admin panel** = LeadBangla staff tool. Customers never see it.
**Main platform** = What customers (tenants) log into and pay for.

The admin panel does NOT replace customer features — it controls the platform that
delivers those features. A customer never needs to touch the admin panel.

---

## 2. The Core Question: How Do Customers Pay for SMS, Email, etc.?

Two possible models. This section decides which one to build and why.

### Model A — Wallet-Based (Platform Manages Everything)

```
Customer → tops up BDT wallet → sends SMS via platform
Platform → pays SSL Wireless the actual cost → keeps margin
Customer bill: subscription plan + wallet top-ups (all in one place)
```

### Model B — Self-Independent (Customer Brings Own API Keys)

```
Customer → creates own SendGrid/SSL Wireless account → enters API keys in LeadBangla
Customer → pays SendGrid/SSL Wireless directly (separate invoice)
Platform bill: subscription plan only
LeadBangla takes: only the monthly plan fee
```

### Decision: Hybrid Model (Recommended)

Neither model alone is right for the Bangladesh SMB market. Use this split:

| Service | Model | Why |
|---|---|---|
| **Email sending** | **Wallet/Credits (platform manages)** | BD SMBs don't have SendGrid accounts. Barrier is real. Platform earns margin. |
| **SMS / WhatsApp** | **Wallet/Credits (platform manages)** | SSL Wireless requires BTRC registration — impossible for every customer. Platform already has it. |
| **Social posting** (Facebook, LinkedIn, X) | **BYOC — customer connects own accounts via OAuth** | These are free API calls tied to the customer's own pages/brand. Platform can't share one Facebook page across tenants. |
| **Push notifications** | **Platform manages (free FCM)** | Zero cost to anyone. Shared VAPID keys per tenant, no billing needed. |
| **Paid Ads** (Google/Meta) | **BYOC — customer's own ad account** | Ad spend is the customer's own money flowing through their account. Already built this way in Steps 20-21. |
| **SEO data** (DataForSEO) | **Platform manages, credit-based** | Usage varies wildly per customer. Credit system lets customers pay for what they use. |

### What This Means for LeadBangla Revenue

```
Revenue stream 1: Monthly plan subscription (BDT/month, via SSLCommerz)
Revenue stream 2: SMS credit top-ups (customer buys BDT credits, uses at BDT/SMS rate)
Revenue stream 3: Email overage credits (emails beyond plan limit, BDT/1000 emails)
Revenue stream 4: SEO credit top-ups (API calls to DataForSEO, BDT/query)

Platform cost that generates Revenue 2:  SSL Wireless ~0.30–0.50 BDT/SMS
Platform markup that becomes Revenue 2:  charge customer ~0.80–1.00 BDT/SMS → ~50–100% margin
Platform cost that generates Revenue 3:  SendGrid ~$0.0004/email (Essentials plan)
Platform markup that becomes Revenue 3:  charge customer ~0.10 BDT/email → clear margin
```

The customer has ONE relationship (with LeadBangla), pays in BDT via bKash/card/Nagad,
and never needs to sign up for SendGrid or SSL Wireless. This is the competitive
advantage over telling customers to "bring your own API keys."

---

## 3. Plan Tier Structure (Admin Configures)

Admin panel can edit these at any time. These are starting defaults:

| Feature | Starter | Growth | Enterprise |
|---|---|---|---|
| **Price (BDT/month)** | 1,500 | 4,500 | 12,000 |
| **Contacts limit** | 2,000 | 25,000 | Unlimited |
| **Email sends/month** | 10,000 | 75,000 | 300,000 |
| **SMS/WhatsApp** | Credits only (no free) | Credits only | Credits only |
| **Team members** | 2 | 5 | Unlimited |
| **Workflows** | 3 | 20 | Unlimited |
| **Landing pages** | 3 | 20 | Unlimited |
| **Social accounts** | 2 | 10 | Unlimited |
| **SEO credits/month** | 50 | 300 | 1,000 |
| **Custom domain** | No | Yes | Yes |
| **Priority support** | No | No | Yes |

Credit rates (admin configures globally — applies to all tenants equally):

| Credit type | Unit | Charge to customer | Platform cost | Margin |
|---|---|---|---|---|
| SMS (domestic BD) | 1 message | 1.00 BDT | ~0.40 BDT | ~60% |
| WhatsApp | 1 conversation | 5.00 BDT | ~2.50 BDT | ~50% |
| Email overage | 1,000 emails | 8.00 BDT | ~$0.004 (~0.44 BDT) | ~94% |
| SEO query | 1 query | 2.00 BDT | ~$0.002 (~0.22 BDT) | ~89% |

---

## 4. Admin Panel — Full Capability Map

Everything the LeadBangla team controls from the admin panel. Nothing here is
visible to customers.

### 4.1 Tenant Management (already exists: Steps 4–5)
- List all organizations (name, plan, status, created date)
- View tenant detail: members, subscription, plan
- Impersonate a tenant user (for support)
- Suspend / reactivate a tenant

### 4.2 Plan Management (NEW — Step 22)
- Create / edit / deactivate subscription plans
- Set BDT price, billing interval (monthly/yearly)
- Set limits: contacts, emails/month, team members, workflows, landing pages, SEO credits/month
- Toggle plan visibility on the public pricing page
- View how many tenants are on each plan

### 4.3 Credit Rate Management (NEW — Step 22)
- Set global credit rates: BDT per SMS, BDT per 1K email overage, BDT per SEO query, BDT per WhatsApp conversation
- Rate changes apply going forward (existing topped-up credits are unaffected)
- Set minimum top-up amount (suggested: 100 BDT)
- View credit purchase history across all tenants

### 4.4 Wallet & Credit Oversight (NEW — Step 23)
- See every tenant's current wallet balance (BDT)
- View per-tenant credit transaction history (top-ups + deductions)
- Manually adjust a wallet balance (for refunds, compensations, trials)
- Set low-balance alert threshold per tenant (sends email warning to tenant)
- See total float held across all wallets (liability view)

### 4.5 Integration Hub (from paidtoolsprompt.md — Step 25)
- Configure credentials for all platform-level services (SendGrid, SSL Wireless, SSLCommerz, Meta, LinkedIn, DataForSEO, Twitter/X, Firebase)
- Toggle each service between sandbox and live mode
- Run connectivity tests per service
- View estimated monthly cost per service

### 4.6 Revenue Dashboard (NEW — Step 26)
- MRR from plan subscriptions (BDT)
- Revenue from credit top-ups this month (BDT)
- Revenue breakdown: plan fees vs. credit sales vs. markup earned
- Tenant churn: cancellations this month vs. new signups
- Per-tenant ARPU (Average Revenue Per User)
- Credit consumption by service (SMS / email overage / SEO)
- Unpaid / failed subscription invoices

### 4.7 Usage Monitor (NEW — Step 26)
- Platform-wide SMS sent this month (total, and cost to platform)
- Platform-wide emails sent this month (total, and cost to platform)
- DataForSEO queries consumed this month
- Per-tenant breakdown: who's the heaviest user of each service

### 4.8 Support Tools (extends existing)
- View a tenant's recent API errors / failed sends
- Resend a failed campaign (admin trigger)
- View webhook delivery logs (SSLCommerz IPN, etc.)
- Manually mark a subscription active (for bank transfer payments)

---

## 5. Main Platform (Customer/Tenant) — Full Capability Map

What the customer sees and does. Admin does NOT manage features here — customers
control their own workspace.

### 5.1 Marketing Tools (already built — Steps 6–21)
All 21 steps already implemented. Customers use email, SMS, social, workflows,
CRM, SEO, affiliate, influencer, push, events, and paid ads from their dashboard.

### 5.2 Billing & Credits (NEW — Steps 22–24)

#### My Plan tab
- Current plan name, price, renewal date
- Usage bars: contacts used vs. limit, emails sent this month vs. limit, SEO credits remaining
- "Upgrade Plan" button → plan selection page
- "Cancel Subscription" → confirmation flow

#### Credit Wallet tab
- Current balance (BDT)
- "Top Up" button → amount input (minimum 100 BDT) → SSLCommerz checkout (bKash/card/Nagad/Rocket)
- Balance history: table of top-ups and deductions with date, type, amount, running balance
- Low balance warning banner (shown when balance < 50 BDT)

#### Credit Rates tab (read-only, informational)
- Shows current rates: "SMS: 1.00 BDT per message", "Email overage: 8.00 BDT per 1,000 emails"
- Usage estimate tool: "If I send 500 SMS this month, cost = 500 BDT"

#### Payment History tab
- Table of all SSLCommerz transactions: subscription payments + wallet top-ups
- Date | Type | Amount (BDT) | Status | Download receipt link

### 5.3 Connected Accounts (NEW — Step 24)
This section consolidates all the places where customers connect their own third-party
accounts (currently scattered across different module pages):

#### Social Accounts
- Connect / disconnect Facebook pages (OAuth)
- Connect / disconnect LinkedIn organization (OAuth)
- Connect / disconnect Twitter/X (if platform has X enabled)
- Status badge per connected account (active token / expired / needs reauth)

#### Ad Accounts
- Already in `/paid-ads` — Google Ads + Meta Ads account connections
- Linked here too so the customer has one place to see all connected accounts

#### Email Domain (optional, Growth/Enterprise only)
- Add sending domain for email (DKIM/SPF setup guide)
- Verify domain ownership

### 5.4 Usage Alerts (NEW — Step 25)
Customer can configure alerts in Settings:
- "Email me when my SMS balance drops below X BDT"
- "Email me when I've used X% of my monthly email quota"
- "Email me when my DataForSEO credits run out"

---

## 6. Technical Architecture (What to Build)

### 6.1 New Database Models

#### `plan_limits` (extends existing `plans` table via migration)

Add columns to existing `plans` table:

```sql
ALTER TABLE plans ADD COLUMN contacts_limit INT NOT NULL DEFAULT 2000;
ALTER TABLE plans ADD COLUMN emails_monthly_limit INT NOT NULL DEFAULT 10000;
ALTER TABLE plans ADD COLUMN team_members_limit INT NOT NULL DEFAULT 2;
ALTER TABLE plans ADD COLUMN workflows_limit INT NOT NULL DEFAULT 3;
ALTER TABLE plans ADD COLUMN landing_pages_limit INT NOT NULL DEFAULT 3;
ALTER TABLE plans ADD COLUMN social_accounts_limit INT NOT NULL DEFAULT 2;
ALTER TABLE plans ADD COLUMN seo_credits_monthly INT NOT NULL DEFAULT 50;
ALTER TABLE plans ADD COLUMN custom_domain BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN priority_support BOOLEAN NOT NULL DEFAULT FALSE;
```

#### `credit_rates` (new table)

```python
class CreditRate(Base):
    __tablename__ = "credit_rates"
    id: UUID PK
    service: str     # "sms" | "whatsapp" | "email_overage" | "seo_query"
    rate_bdt: Numeric(10, 4)   # BDT per unit (1 SMS, 1000 emails, 1 query)
    unit_label: str  # "per SMS" | "per 1,000 emails" | "per query"
    is_active: bool  default True
    updated_at: DateTime
    updated_by: str  # admin email who changed it
```

Seed 4 rows on migration (SMS, WhatsApp, email_overage, seo_query).

#### `org_wallet` (new table)

```python
class OrgWallet(Base):
    __tablename__ = "org_wallets"
    id: UUID PK
    organization_id: UUID  FK → organizations.id UNIQUE  # one wallet per org
    balance_paisa: int  default 0   # stored in paisa (1 BDT = 100 paisa) to avoid float
    low_balance_threshold_paisa: int  default 5000  # 50 BDT
    updated_at: DateTime
```

Use paisa (integer) everywhere internally. Convert to BDT only for display.

#### `wallet_transactions` (new table)

```python
class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    id: UUID PK
    organization_id: UUID  FK → organizations.id, indexed
    type: str   # "topup" | "deduction" | "admin_adjustment" | "refund"
    amount_paisa: int   # positive = credit, negative = deduction
    balance_after_paisa: int  # snapshot of balance after this transaction
    service: str | None   # "sms" | "email_overage" | "seo_query" | null (for top-ups)
    units_consumed: int | None  # e.g. 5 for 5 SMS, 1000 for 1000 emails
    reference_id: str | None   # SSLCommerz tran_id (for top-ups) or campaign_id (for deductions)
    note: str | None            # admin note for manual adjustments
    created_at: DateTime server_default
```

### 6.2 Wallet Service Logic

```python
# backend/app/services/wallet_service.py

async def get_balance(db, org_id) -> int:
    """Returns balance in paisa. Creates wallet row if not exists (idempotent)."""

async def can_afford(db, org_id, cost_paisa: int) -> bool:
    """Returns True if balance >= cost_paisa."""

async def deduct(db, org_id, cost_paisa, service, units, reference_id) -> WalletTransaction:
    """
    Atomically deducts cost from wallet.
    Raises InsufficientBalanceError if balance would go negative.
    Creates WalletTransaction record.
    """

async def topup(db, org_id, amount_paisa, tran_id) -> WalletTransaction:
    """Adds amount to wallet. Called by SSLCommerz IPN webhook."""

async def admin_adjust(db, org_id, amount_paisa, note, admin_email) -> WalletTransaction:
    """Admin-only. Can be negative (deduction) or positive (credit)."""
```

Key rule: `deduct()` must use `SELECT FOR UPDATE` on the wallet row to prevent
race conditions when two sends happen simultaneously (two concurrent SMS campaigns).

```python
async def deduct(db, org_id, cost_paisa, ...):
    # PostgreSQL advisory lock or SELECT FOR UPDATE:
    wallet = await db.scalar(
        select(OrgWallet)
        .where(OrgWallet.organization_id == org_id)
        .with_for_update()   # ← row-level lock
    )
    if wallet.balance_paisa < cost_paisa:
        raise InsufficientBalanceError(f"Balance {wallet.balance_paisa} paisa < {cost_paisa} paisa needed")
    wallet.balance_paisa -= cost_paisa
    # create WalletTransaction...
    await db.commit()
```

### 6.3 Credit Gate in SMS and Email Services

Before every send, check wallet and deduct:

```python
# In sms_service.py — before calling sslwireless_client.send_sms()
rate = await get_credit_rate(db, "sms")   # fetch from credit_rates table
cost_paisa = rate.rate_bdt * 100          # convert BDT to paisa
await wallet_service.deduct(
    db, org_id, int(cost_paisa),
    service="sms", units=1, reference_id=str(sms_campaign_id)
)
await sslwireless_client.send_sms(db=db, to=number, message=body)
```

For email, check monthly quota first. Only deduct wallet credits for overages:

```python
# In campaign_service.py — before sending each email
monthly_sent = await count_emails_sent_this_month(db, org_id)
plan_limit = await get_plan_limit(db, org_id, "emails_monthly_limit")

if monthly_sent < plan_limit:
    pass  # within plan — no credit charge
else:
    # overage — charge wallet per 1000 emails
    rate = await get_credit_rate(db, "email_overage")
    await wallet_service.deduct(db, org_id, int(rate.rate_bdt * 100), service="email_overage", units=1, ...)
```

### 6.4 New API Routes

**Tenant-facing (`/v1/billing/`):**

```
GET  /billing/plan-usage          → { plan, contacts_used, contacts_limit, emails_sent,
                                       emails_limit, seo_credits_used, seo_credits_limit, ... }
GET  /billing/wallet              → { balance_bdt, balance_paisa, low_balance_threshold_bdt }
POST /billing/wallet/topup        → { amount_bdt } → SSLCommerz checkout URL
POST /billing/wallet/topup/ipn    → IPN webhook (SSLCommerz calls this on success)
GET  /billing/wallet/transactions → paginated WalletTransaction list
GET  /billing/credit-rates        → current CreditRate list (public, no auth)
```

**Admin-facing (`/v1/admin/`):**

```
# Plan management
GET    /admin/plans               → all plans (including inactive)
POST   /admin/plans               → create new plan
PATCH  /admin/plans/{id}          → update plan (limits, price, is_active)

# Credit rate management
GET    /admin/credit-rates        → all rates
PATCH  /admin/credit-rates/{id}   → update rate (rate_bdt)

# Wallet oversight
GET    /admin/wallets             → all org wallets (balance, org name, last topup date)
GET    /admin/wallets/{org_id}    → wallet detail + transaction history
POST   /admin/wallets/{org_id}/adjust → manual adjustment (amount_paisa, note)

# Revenue
GET    /admin/revenue/summary     → MRR, credit revenue this month, total float
GET    /admin/revenue/transactions?type=plan|topup|all → merged transaction history
GET    /admin/revenue/usage       → platform-wide SMS/email/seo consumed this month

# Usage limits enforcement
GET    /admin/usage               → per-tenant usage vs limits (who's near the cap)
```

---

## 7. Build Steps (Step 22 onwards)

These are the concrete implementation steps. Execute in order.

---

### Step 22 — Plan Limits & Credit Rates System

**Depends on:** Steps 1–21  
**Migration:** `0017_add_plan_limits_and_credit_rates.py`  

**Backend:**
- Alembic migration: add limit columns to `plans` table + create `credit_rates` table
- Seed `credit_rates` with 4 rows (SMS, WhatsApp, email_overage, seo_query)
- Update existing plan seed rows in the migration with correct limits per the table in Section 3
- New schemas: `PlanDetail` (includes limits), `CreditRateRead`, `CreditRateUpdate`
- New service: `plan_service.get_org_plan_limits(db, org_id)` → resolves org → subscription → plan → limits
- New admin routes: `GET/POST/PATCH /admin/plans`, `GET/PATCH /admin/credit-rates`
- New tenant route: `GET /billing/plan-usage` (current usage vs limits per resource)

**Admin panel (new page `/plans`):**
- Plan list table: Name | Price BDT | Interval | Contacts | Emails/mo | Active | Tenants count
- "Edit" modal per plan: editable limits, price, name
- "Add Plan" button → create modal
- Credit Rates section (same page, below plans): table with current rates, inline edit per row

**Main platform — dashboard update:**
- Add usage bars to the Dashboard home page (contacts: X / 2,000, emails: X / 10,000)
- Add "Upgrade" CTA when usage > 80% of any limit

**DoD:** editing a plan's email limit in admin panel immediately changes what `GET /billing/plan-usage` returns for tenants on that plan; editing credit rates takes effect on the next send.

---

### Step 23 — Wallet & Credit System

**Depends on:** Step 22  
**Migration:** `0018_create_wallet_tables.py`

**Backend:**
- Create `org_wallets` and `wallet_transactions` tables
- `wallet_service.py`: `get_balance`, `can_afford`, `deduct` (with `SELECT FOR UPDATE`), `topup`, `admin_adjust`
- `InsufficientBalanceError` exception class
- SSLCommerz top-up flow: `POST /billing/wallet/topup` → checkout URL (tran_id prefix `WALLET-`) → IPN → `wallet_service.topup()`
- Dev: fake-checkout path for wallet top-ups (same pattern as subscription billing)
- Wire deduction into `sms_service.py`: deduct before each SMS send; if `InsufficientBalanceError` → mark message failed with reason "insufficient_balance"
- Wire quota check + overage deduction into `campaign_service.py` (email sends)
- Tenant routes: wallet balance, topup, transaction history
- Admin routes: all-wallets list, wallet detail, manual adjustment

**Main platform (`/billing` page, new module):**
- Tab 1 "My Plan": plan name, limits, usage bars, upgrade CTA
- Tab 2 "Credit Wallet": balance display in BDT, "Top Up" button with amount presets (100 / 250 / 500 / 1000 BDT), transaction history table
- Tab 3 "Payment History": merged list of subscription payments + wallet top-ups
- Low balance warning banner (shown at top of all pages when balance < threshold)

**DoD:** tenant tops up 200 BDT via fake checkout → balance shows 200 BDT → sends 5 SMS → balance deducts 5 BDT → transaction history shows deductions; sending SMS with zero balance returns a clear "insufficient balance" error not a 500.

---

### Step 24 — Admin Wallet & Revenue Dashboard

**Depends on:** Step 23

**Admin panel (new pages):**

**`/wallets` page:**
- Table: Org name | Plan | Balance (BDT) | Last top-up | Top-up count | Total spent (BDT)
- Click any row → wallet detail: full transaction history for that org
- "Adjust Balance" button → modal: amount (positive or negative), note → calls adjust endpoint
- Filter: show only orgs with balance < 50 BDT (to identify at-risk tenants)

**`/revenue` page:**
- KPI strip: MRR (plan subscriptions) | Credit revenue this month | Total float held | Active tenants
- Plan revenue chart: bar per plan, height = plan price × tenant count
- Credit revenue breakdown: SMS credits sold | Email overage | SEO credits | WhatsApp
- Platform cost vs revenue: SSL Wireless cost estimate vs SMS revenue (shows margin)
- Recent transactions table: Date | Org | Type (Plan payment / Wallet top-up) | Amount (BDT) | Status

**`/usage` page:**
- Platform-wide stats: total SMS sent this month, total emails sent, total SEO queries
- Per-tenant table: Org | SMS this month | Emails this month | Near-limit warnings
- Filter to show only tenants over 80% of any limit (to proactively upsell)

**DoD:** after seeding demo data, Revenue page shows correct MRR; Wallets page shows all org balances; adjusting a balance in admin is immediately reflected in the tenant's billing page.

---

### Step 25 — Platform Integration Hub (Admin)

**Depends on:** Steps 22–24  
**Migration:** `0019_create_platform_services.py`

This is the full integration credential management system (previously drafted in
`paidtoolsprompt.md` Steps 22–25). Full details there. Summary:

**Backend:**
- `PlatformService` DB model with Fernet-encrypted JSONB credentials
- Seed 8 services (SSLCommerz, SendGrid, SSL Wireless, Meta Social, LinkedIn, Firebase, DataForSEO, Twitter/X)
- Admin API: list/get/patch/test services
- `get_live_creds(db, code)` helper for integration clients to call
- Refactor all integration clients (SendGrid, SSL Wireless, SSLCommerz, Meta, LinkedIn, VAPID push) to read credentials from DB with env var fallback

**Admin panel (`/integrations` page):**
- Service cards by category showing Live/Sandbox/Unconfigured/Disabled status
- Per-service configure modal with the exact credential fields
- "Test Connection" button that pings the real API
- Cost summary strip

**DoD:** admin enters SendGrid credentials via UI, clicks Test → green; subsequent email campaigns use real SendGrid without any `.env` change.

---

### Step 26 — Plan Enforcement Middleware

**Depends on:** Steps 22–23

All platform limits defined in Step 22 must be enforced — not just shown. Add
enforcement at the service layer (not route layer) for each limit:

**Contacts limit:** In `contact_service.create_contact()`, before inserting:
```python
current_count = await count_contacts(db, org_id)
limit = await get_plan_limit(db, org_id, "contacts_limit")
if current_count >= limit:
    raise PlanLimitError("contacts", current_count, limit)
```

**Workflows limit:** In `workflow_service.create_workflow()`.

**Landing pages limit:** In `landing_page_service.create_landing_page()`.

**Social accounts limit:** In `social_service.connect_account()`.

**Team members limit:** In `membership_service.invite_member()`.

All `PlanLimitError` exceptions → HTTP 402 with body:
```json
{
  "error": "plan_limit_reached",
  "resource": "contacts",
  "current": 2000,
  "limit": 2000,
  "upgrade_url": "/billing?tab=plan"
}
```

**Main platform:** handle HTTP 402 from any of the above with a modal:
> "You've reached your Starter plan limit for contacts (2,000 / 2,000).
> Upgrade to Growth for up to 25,000 contacts."
> [Upgrade Now] [Maybe Later]

**DoD:** on a Starter plan org with 2,000 contacts, trying to import one more contact
returns the 402 with upgrade prompt; after upgrading the plan in admin, the same org
can immediately add more contacts.

---

### Step 27 — Connected Accounts Hub (Main Platform)

**Depends on:** Steps 23–26

Currently, social account connections are scattered inside the Social module, and ad
accounts are inside the Paid Ads module. Consolidate into a single **Connected
Accounts** section in Settings.

**New page: `/settings/connections`**

Tabs:
- **Social** — Facebook pages / LinkedIn orgs / Twitter/X (if live). Each shows:
  account name, avatar, connection status, "Disconnect" button, "Reconnect" (if token expired)
- **Ad Accounts** — Google Ads + Meta Ads accounts (read from existing `paid_ads_accounts` table)
- **Email Domain** — (Growth/Enterprise only) add custom sending domain, DKIM setup guide
- **Platform Status** — read-only list: Email (SendGrid) Live ✓ | SMS (SSL Wireless) Sandbox ◐ | etc.

The Social and Paid Ads modules still work as before — this page is just a
consolidated view + management UI. No new backend models needed; reads from
existing `paid_ads_accounts` and (existing) social account storage.

**DoD:** a customer can see all their connected third-party accounts in one place;
reconnecting an expired Facebook token from this page fixes social posting without
navigating to the Social module settings.

---

### Step 28 — Overage Alerts & Low Balance Notifications

**Depends on:** Steps 23–24

**Backend (Celery scheduled task — runs daily):**

```python
# workers/tasks.py — new daily task

@celery_app.task
async def check_wallet_and_usage_alerts():
    """Runs daily. Checks all orgs for low balance and near-limit usage."""
    orgs = await get_all_active_orgs(db)
    for org in orgs:
        wallet = await get_wallet(db, org.id)
        if wallet.balance_paisa < wallet.low_balance_threshold_paisa:
            await send_low_balance_alert_email(org, wallet)

        usage = await get_plan_usage(db, org.id)
        for resource, pct in usage.items():
            if pct >= 0.90:  # 90% of limit used
                await send_usage_alert_email(org, resource, pct)
```

Email template for low balance:
> "Your LeadBangla credit balance is running low (current: X BDT).
>  Top up now to keep SMS and email sending uninterrupted."
> [Top Up Now →]

Email template for usage limit:
> "You've used 92% of your monthly email quota (9,200 / 10,000).
>  Upgrade your plan or purchase overage credits to avoid interruptions."
> [View Options →]

**Tenant settings:** a "Notification Preferences" section in Settings where the
tenant can set their own low-balance threshold (default 50 BDT, min 0) and
toggle each alert type on/off. Stored in a new `org_notification_settings` table.

**Admin panel:** on the `/wallets` page, a "Near-threshold" filter shows all orgs
below their own threshold so admins can proactively reach out.

**DoD:** seeding a demo org wallet at 30 BDT (below the 50 BDT threshold) and
running the Celery task sends a low-balance alert email to that org's owner.

---

### Step 29 — Billing Admin Page (Main Platform)

**Depends on:** Steps 22–24  
This step makes `/billing` the one place a customer handles all money matters.

The `/billing` page should have **no overlapping UI** with `/settings`. Move anything
billing-related out of Settings into Billing. The nav item "Billing" replaces
"Settings > Plan" if that existed.

Final `/billing` page tab structure:

**Tab: My Plan**
- Current plan card: name, price, next renewal date
- Usage bars for every limited resource (contacts, emails, workflows, landing pages, team, social accounts, SEO credits)
- "Upgrade Plan" → `/pick-plan`
- "Cancel Plan" → confirmation with consequence summary

**Tab: Credit Wallet**
- Balance in BDT, large and prominent
- Low balance warning (if applicable)
- Quick top-up buttons: 100 / 250 / 500 / 1,000 BDT + custom amount
- "Top Up" → SSLCommerz checkout
- Transaction history table (last 30, paginated): Date | Description | Amount | Balance after

**Tab: Credit Rates**
- Current SMS rate, email overage rate, SEO query rate
- Estimate calculator: "If I send X SMS this month = Y BDT"
- Static, read-only for tenants

**Tab: Invoices**
- Combined list: subscription renewals + wallet top-ups
- Date | Description | Amount BDT | Status badge | Download (stub for now — real PDF invoices in a future step)

**DoD:** a new tenant who just completed onboarding sees correct plan limits at zero
usage; tops up 200 BDT via fake checkout; sees balance reflected immediately; sends
3 test SMS; sees 3.00 BDT deducted in transaction history.

---

### Step 30 — Seed Data Update & Full System Verification

**Depends on:** Steps 22–29

**Seed script update (`app/scripts/seed_demo_data.py`):**

For each demo tenant created by the seed script, add:
- Wallet with a starting balance: Starter demo = 150 BDT, Growth demo = 500 BDT
- Wallet transactions: fake top-up + some deductions (to make history non-empty)
- Set plan limits on all plans (update the 3 existing plan rows via upsert)
- Seed `credit_rates` table (idempotent — skip if rows already exist)
- Seed `platform_services` table (8 rows, all `is_live=False`, no credentials)

**End-to-end checklist:**

Admin panel:
- [ ] `/plans` shows 3 plans with correct limits; can edit Growth email limit from 75K to 80K → immediately visible to Growth tenants
- [ ] `/credit-rates` shows SMS at 1.00 BDT; edit to 1.20 BDT → next SMS campaign charges 1.20 BDT
- [ ] `/wallets` shows all org balances; manually add 100 BDT to a Starter tenant
- [ ] `/revenue` shows correct MRR from seeded subscriptions + credit top-up revenue
- [ ] `/integrations` shows all 8 services; enter fake SendGrid key, click Test → connection error (expected); enter real key, Test → success
- [ ] Tenant detail page shows wallet balance for that org

Main platform:
- [ ] `/billing` page loads with correct plan name and usage bars at seed data values
- [ ] "Top Up 200 BDT" → fake checkout → balance shows 200 BDT
- [ ] Send 5 SMS campaign → wallet deducts 5 BDT → transaction history shows deductions
- [ ] Try to create more contacts than plan limit → 402 with upgrade modal
- [ ] Dashboard shows usage bars turning orange at 80%, red at 100%
- [ ] Low-balance warning banner appears when wallet < 50 BDT

---

## 8. Summary: Who Controls What

| Action | Done by | Where |
|---|---|---|
| Set plan prices | LeadBangla admin | Admin panel → Plans |
| Set plan limits (contacts/emails/etc.) | LeadBangla admin | Admin panel → Plans |
| Set SMS/email credit rates | LeadBangla admin | Admin panel → Credit Rates |
| Configure SendGrid/SSL Wireless credentials | LeadBangla admin | Admin panel → Integrations |
| Toggle service live/sandbox | LeadBangla admin | Admin panel → Integrations |
| Adjust tenant wallet manually (refund/credit) | LeadBangla admin | Admin panel → Wallets |
| See all revenue + credit sales | LeadBangla admin | Admin panel → Revenue |
| Choose a subscription plan | Customer | Main platform → Billing → My Plan |
| Top up credit wallet | Customer | Main platform → Billing → Credit Wallet |
| View their own balance & usage | Customer | Main platform → Billing |
| Connect their own social accounts | Customer | Main platform → Settings → Connections |
| Connect their own Google/Meta Ad accounts | Customer | Main platform → Paid Ads |
| Send SMS / email (consumes credits) | Customer | Main platform → Campaigns / SMS |

The customer never manages API keys. The admin never does marketing. The two panels
are completely separate in purpose, access, and UI.
