# Implementation prompt: Email "Bring Your Own SendGrid" (BYOK) with plan gating

Paste this whole file into a fresh session to implement. It is self-contained —
no prior conversation context is assumed.

## Background

LeadBangla is a multi-tenant marketing SaaS (FastAPI backend in `backend/`,
two Vite/React/Tailwind frontends: `frontend/main-app` for tenants and
`frontend/admin-panel` for internal staff). Tenants currently send all
campaign email through one platform-wide SendGrid account
(`app/integrations/sendgrid.py`), configured once by an admin in
Admin → Integrations (`platform_services` table, no per-tenant override —
see `app/core/service_creds.get_live_creds`, which takes no `org_id`).

Email usage today is governed by a monthly cap on the org's subscription
plan (`Plan.emails_monthly_limit`): sends within the cap are free, sends
over the cap deduct wallet credit at the `email_overage` `CreditRate`
(see `app/services/campaign_service.py` around the `over_limit` branch).
SMS/WhatsApp use a similar wallet-deduction model and must **stay
wallet-only** — bulk SMS in Bangladesh requires a BTRC-registered
masking ID tied to a Trade License + TIN, which most tenants won't have,
so self-service BYOK for SMS is out of scope permanently, not just for v1.

Social and Ad accounts (`frontend/main-app/src/modules/settings/ConnectionsPage.tsx`)
are already tenant-owned via OAuth — no platform-shared option exists for
those. This task extends the same "tenant owns their own connection" idea
to email, while keeping the wallet path as the default for everyone else.

## Decision being implemented

| Channel | Model |
|---|---|
| SMS / WhatsApp | Wallet only — no change, do not touch |
| Email | Wallet by default; BYOK (tenant's own SendGrid key + authenticated sending domain) unlockable on plans that allow it |
| Push, Social, Ads | Already BYOK via OAuth — no change |

When a tenant turns on BYOK for email: **stop wallet/overage deductions
for email entirely for that org**, and stop applying `emails_monthly_limit`
to them — they're paying SendGrid directly, so the platform's own cost
controls no longer apply to their sends.

## Open decisions to confirm with the product owner before/while building

These are genuine judgment calls, not implementation details — pick a
default, implement it, and flag it in the PR description so it's easy to
flip:

1. **Which plans get the BYOK toggle available?** Recommended default:
   Growth and Pro (i.e. not Starter) — implement as a per-plan boolean
   (see migration below) so it's admin-configurable per plan, not
   hardcoded to plan codes.
2. **Mid-cycle toggle behavior**: if a tenant enables BYOK partway through
   a billing month, do already-counted `emails_sent_this_month` numbers
   reset? Recommended: leave the counter alone (it just becomes inert
   while BYOK is active) rather than resetting it, so re-disabling BYOK
   later doesn't let them dodge the cap they'd already used.
3. **Plan downgrade while BYOK is active**: if a tenant on Growth (BYOK
   enabled) downgrades to Starter (BYOK not allowed), auto-disable BYOK
   and fall back to platform sending, or block the downgrade? Recommended:
   auto-disable + notify, don't block the downgrade.
4. **Analytics**: should BYOK-sent volume still be counted anywhere for
   reporting (Admin → Revenue "credit consumption" chart currently only
   shows paid usage)? Recommended: out of scope for v1 — BYOK sends are
   invisible to platform revenue reporting by design, since no money
   changed hands on the platform side.

Implement with the recommended defaults above unless told otherwise.

## Backend changes

### 1. Migration `0028_add_email_byok.py` (latest existing migration is `0027`)

- Add `email_byok_allowed: bool = False` to the `plans` table (same
  pattern as the existing `custom_domain` / `priority_support` boolean
  columns on `Plan`, `app/models/billing.py:30-31`).
- Data migration: `UPDATE plans SET email_byok_allowed = true WHERE code IN ('growth', 'pro')`
  (adjust to actual seeded plan codes — check `alembic/versions/` for the
  plans seed migration to confirm codes).
- Create table `org_email_senders`:
  ```
  id                 uuid pk
  organization_id    uuid fk -> organizations.id, unique, cascade delete
  provider           varchar(30) not null default 'sendgrid'
  api_key_enc        text nullable   -- Fernet ciphertext, same helper as PlatformService.credentials_enc
  from_email         varchar(255) nullable
  from_name          varchar(120) nullable
  sending_domain     varchar(255) nullable
  sendgrid_domain_id varchar(64) nullable   -- id SendGrid gives back for the authenticated domain
  dns_records        jsonb nullable          -- the CNAME records SendGrid returns, to show the tenant
  domain_verified    boolean not null default false
  is_active          boolean not null default false   -- the actual BYOK on/off switch
  last_tested_at     timestamptz nullable
  last_test_ok       boolean nullable
  last_test_error    text nullable
  created_at / updated_at timestamptz
  ```
  Mirror the column shape of `PlatformService` (`app/models/platform_service.py`)
  where it overlaps — same encryption approach, same test-result fields —
  so the admin-side mental model transfers directly.

### 2. Model — `app/models/org_email_sender.py`

`OrgEmailSender(Base)` matching the table above. Add the SQLAlchemy model
next to `app/models/wallet.py` style (simple, no relationships needed
beyond the FK).

### 3. Schemas — `app/schemas/org_email_sender.py`

- `OrgEmailSenderRead`: everything except `api_key_enc` (never return raw
  or even ciphertext key material to the frontend — return a
  `has_api_key: bool` computed field instead, same pattern the admin
  Integration Hub uses with `has_credentials`).
- `OrgEmailSenderUpdate`: `api_key: str | None`, `from_email: str | None`,
  `from_name: str | None`, `sending_domain: str | None` (all optional —
  PUT is a partial upsert, blank api_key means "leave unchanged", same
  convention as `ConfigureModal` in the admin Integration Hub frontend
  which already does this for platform-level credentials).
- `DnsRecord`: `{ type: str, host: str, data: str }` — reuse whatever
  shape `app/integrations/sslcommerz.py`-style stubs already use if one
  exists, otherwise this simple shape.
- Reuse `IntegrationTestResult` from `app/schemas/platform_service.py`
  for the test-connection response.

### 4. Service — `app/services/org_email_service.py`

Functions:
- `get_config(db, org_id) -> OrgEmailSender | None`
- `upsert(db, org_id, data: OrgEmailSenderUpdate) -> OrgEmailSender` —
  encrypts `api_key` via `app/core/cred_crypto.encrypt_creds` if provided
  (wrap the single string in `{"api_key": ...}` like `PlatformService`
  does, or add a lighter single-value helper if that feels cleaner).
- `start_domain_authentication(db, org_id) -> OrgEmailSender` — calls
  SendGrid's Domain Authentication API
  (`POST /v3/whitelabel/domains`, see SendGrid API reference) when a real
  key + `sending_domain` are set; stores the returned `id` as
  `sendgrid_domain_id` and the DNS record list as `dns_records`. When
  `settings.sendgrid_is_fake` (no real key at all — platform-wide fake
  mode) or when the org's own key isn't set yet, return three canned fake
  CNAME records so the tenant-facing flow is fully testable without a
  real SendGrid account, matching the sandbox philosophy already used
  everywhere else in this codebase (`sendgrid.py`, `sslwireless.py`,
  `meta.py`, `linkedin.py` all do this via `is_fake`).
- `verify_domain(db, org_id) -> OrgEmailSender` — calls SendGrid's verify
  endpoint (`POST /v3/whitelabel/domains/{id}/validate`) for real
  configs; in fake mode, just flips `domain_verified = True`
  unconditionally (simulating success) after a short delay is not
  necessary — instant is fine, this mirrows how `complete_topup`
  short-circuits in the wallet fake-checkout flow.
- `test_connection(db, org_id) -> IntegrationTestResult` — same shape as
  `app/services/integration_test_service.py`'s existing per-service test
  functions; for SendGrid, hit `GET /v3/user/account` with the org's key
  to confirm it's valid (or return a canned success in fake mode).
- `set_active(db, org_id, active: bool) -> OrgEmailSender` — the on/off
  switch. Raise a domain-specific error (e.g. `EmailByokNotAllowedError`)
  if `active=True` but:
  - the org's plan doesn't have `email_byok_allowed` (check via
    `app/services/plan_service.get_plan_limit` — note this function
    currently types its return as `int` but works fine with a bool
    column via `getattr`; either reuse it directly or add a tiny
    `has_plan_feature(db, org_id, field) -> bool` wrapper for clarity), or
  - `api_key_enc` is not set, or
  - `sending_domain` is set but `domain_verified` is `False`.

### 5. Credential resolution — extend `app/core/service_creds.py`

Add `get_org_email_creds(db, org_id) -> dict | None`:
```python
async def get_org_email_creds(db: AsyncSession, org_id: uuid.UUID) -> dict | None:
    """Org's own SendGrid key if BYOK is active and configured; else None
    (caller should fall back to the platform-wide get_live_creds)."""
    sender = await db.scalar(
        select(OrgEmailSender).where(OrgEmailSender.organization_id == org_id)
    )
    if sender and sender.is_active and sender.api_key_enc:
        creds = decrypt_creds(sender.api_key_enc)
        creds["from_email"] = sender.from_email or creds.get("from_email")
        return creds
    return None
```
This does **not** replace `get_live_creds` — it's checked first, with
`get_live_creds(db, "sendgrid")` as the fallback, same layering as
env-var fallback already works today in `_env_fallback`.

### 6. Wire into `app/integrations/sendgrid.py`

`send_email` currently takes no `org_id`. Add it as a required parameter
and thread it through from every call site (confirmed via
`grep -rn "sendgrid_client.send_email"`):
- `app/services/campaign_service.py:190`
- `app/services/notification_service.py:83` and `:105`
- `app/services/admin_service.py:195` and `:207` — check what org context
  these two calls have available; they may be admin-initiated sends not
  tied to a single tenant (e.g. platform notices), in which case pass
  `None`/skip org lookup and always use platform creds — don't force an
  `org_id` where one doesn't conceptually exist.
- `app/workers/workflow_runner.py:87`

Inside `send_email`:
```python
creds = await get_org_email_creds(db, org_id) or await get_live_creds(db, "sendgrid")
```

### 7. Wire into `app/services/campaign_service.py`

Before the per-recipient send loop (around the `over_limit` /
`per_email_overage_paisa` block), check whether the org has BYOK active
for email (`org_email_service.get_config` → `is_active`). If so:
- skip the `over_limit` check and the `deduct(...)` call entirely — every
  send in this campaign is free from the platform's perspective,
  regardless of `emails_monthly_limit`.
- still increment `emails_sent_this_month` for the "open decision #2"
  bookkeeping default above (inert while BYOK is on, but not deleted).

Also update `campaign_precheck` (the endpoint that shows the user
"X free sends remaining, Y will cost credits" before they hit send) to
return a `byok_active: bool` field alongside the existing
`free_remaining` / `billable_count` (types already declared in
`frontend/main-app/src/lib/campaigns.ts:21-22`). The display logic lives
in `frontend/main-app/src/modules/email/CampaignDetailPage.tsx:282-286` —
add a branch there that shows "Sending via your own SendGrid — unmetered"
instead of the free/billable breakdown when `byok_active` is true.

### 8. New router — `app/api/v1/email_sender.py`

Tenant-facing, auth via `get_current_membership` (same dependency
`billing.py` uses). Routes under `/email-sender`:
- `GET /` → `OrgEmailSenderRead` (or a sensible "not configured yet"
  default object) plus a `byok_allowed_on_plan: bool` field so the
  frontend can render the upsell state without a second request.
- `PUT /` → upsert config (plan-gate is only enforced at `set_active`
  time, not here — a tenant should be able to fill in their key/domain
  before their plan allows enabling it, so they're ready to flip it on
  right after upgrading).
- `POST /verify-domain`
- `POST /test`
- `POST /toggle` body `{"active": bool}`

Register in `app/api/v1/__init__.py` following the existing pattern
(import + `api_router.include_router(email_sender_router)`, next to the
`billing_router` line).

## Frontend changes (`frontend/main-app`)

### `src/lib/email_sender.ts`

New API client file, same `apiFetch` shape as `src/lib/social.ts`
(bearer token via `getAccessToken()`, base path `/api/v1/email-sender`).
Export types mirroring the backend schemas and functions for each route.

### `src/modules/settings/ConnectionsPage.tsx`

Add a new section, "Email Sending", alongside the existing Social
Accounts / Ad Accounts / Platform Services Status sections (same visual
pattern: `<h2 className="section-label ...">` + `Card` list). Behavior:

- If `!byok_allowed_on_plan`: show a single `Card` with a short pitch
  ("Send campaign email from your own domain — available on Growth and
  above") and a `Button` linking to `/billing` (upgrade), disabled/greyed
  form underneath for preview. Do not hide the feature entirely — showing
  it locked is a normal upsell pattern (compare to how the existing
  Twitter/X card in this same file shows a disabled "Connect" button with
  an explanatory line).
- If allowed: a form (`Input` for API key — masked, same placeholder
  convention as the admin `ConfigureModal`: `"•••••••• (unchanged if left
  blank)"` — plus `from_email`, `from_name`, `sending_domain`), a "Save"
  button, then once a domain is set and unverified, render the returned
  `dns_records` as a small table with copyable values and a "Verify"
  button; once verified, show a `Toggle` to turn BYOK on/off (disabled
  until key + verified domain are both present — surface why via helper
  text rather than just disabling silently), and a "Send test email"
  button that calls `/test` and shows the result inline (reuse the
  existing `Alert` component for success/failure, same as everywhere else
  in this codebase).

Match the existing component set exactly — `Card`, `Badge`, `Button`,
`Input`, `Toggle`, `Alert`, `PageHeader` are all already imported in this
file or available in `src/components/`. No new design system component
should be needed for this.

## Admin panel changes (`frontend/admin-panel`)

### `src/plans/PlansPage.tsx`

Add `email_byok_allowed` as a third checkbox in `PlanEditModal` next to
the existing `custom_domain` / `priority_support` checkboxes (same markup
pattern, `~line 149-162` in the current file). Add it to `LIMIT_FIELDS`-
adjacent display if there's room, or at minimum make it editable — it
doesn't need its own table column to ship v1, since the boolean checkbox
inside the edit modal is enough for admins to manage it.

No other admin-panel change is required for v1 (per the "open decisions"
section, BYOK usage isn't surfaced in Wallets/Revenue reporting yet).

## Security notes

- `api_key_enc` must never be returned to the frontend, not even
  encrypted — same rule the admin `platform_services` table already
  follows (`credentials_enc` has a code comment: "NEVER returned to the
  client").
- Domain verification must call SendGrid for real DNS validation in live
  mode — do not trust a client-submitted "yes I added the records" flag.
- Toggling BYOK on/off should be restricted to org owners/admins (reuse
  whatever role check gates other org-settings mutations today — check
  `get_current_membership` usage elsewhere for the existing convention,
  e.g. in `billing.py`'s subscription endpoints).

## Testing checklist

- [ ] Migration applies and rolls back cleanly (`alembic upgrade head` /
      `alembic downgrade -1`).
- [ ] `get_org_email_creds` returns `None` when `is_active=False` even if
      a key is stored (config saved but not switched on yet).
- [ ] `campaign_service` skips `deduct()` for a BYOK-active org even when
      `emails_sent_this_month` is far over `emails_monthly_limit`.
- [ ] `set_active(True)` raises when the org's plan lacks
      `email_byok_allowed`, when no key is stored, and when a domain is
      set but unverified — three separate failure cases, test each.
- [ ] Fake-mode domain authentication/verification works end-to-end with
      zero real SendGrid credentials, same zero-cost testing story as the
      rest of the platform's sandbox integrations.
- [ ] Frontend: locked-state Card renders for a Starter-plan org; full
      form renders and functions for a Growth-plan org.
