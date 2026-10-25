# LeadBangla — Third-Party Service Integration Control Prompts

This file covers the platform's **integration hub**: a unified admin panel to manage
every third-party service the platform depends on — configure credentials, toggle
live vs sandbox, test connectivity, track costs, and add new services — all from the
UI instead of editing environment variables.

Extends `prompt.md` (Steps 1–21). All existing architecture rules apply.

---

## What already exists (the problem to solve)

Every third-party service in the platform is currently wired via **environment
variables in `.env`**, with a hardcoded `is_fake` check comparing the env var
against a placeholder string:

```python
# config.py — current state
sendgrid_api_key: str = SENDGRID_PLACEHOLDER_KEY

@property
def sendgrid_is_fake(self) -> bool:
    return self.sendgrid_api_key == SENDGRID_PLACEHOLDER_KEY
```

**Problems this causes:**
- No admin can see which services are configured without SSH access to the server
- Updating a credential requires editing `.env` and restarting containers
- No status visibility — no way to know if a key is valid or expired
- No cost tracking — can't see what you're spending on each service
- No way to disable a service without removing its env var
- Adding a new service integration requires a code deploy just to add a field to `config.py`

**What we're building:** a `platform_services` table in the database with encrypted
credentials per service, an admin panel Integration Hub to manage them, and updated
integration clients that read from DB first and fall back to env vars.

---

## Complete service catalog (reference for all steps)

These are every third-party service the platform uses or plans to use:

| code | name | category | cost_model | est_monthly_usd | who sets creds |
|---|---|---|---|---|---|
| `sslcommerz` | SSLCommerz | payment | % per transaction (~2.5–3.5% BDT) | variable | Platform admin |
| `sendgrid` | SendGrid Email | email | Free 100/day; $19.95/mo Essentials | $0–20 | Platform admin |
| `sslwireless` | SSL Wireless SMS | sms | ~0.20–0.50 BDT/SMS | variable | Platform admin |
| `meta_social` | Meta Graph API | social | Free | $0 | Platform admin |
| `linkedin` | LinkedIn Marketing API | social | Free (MDP approval req'd) | $0 | Platform admin |
| `firebase_vapid` | Firebase / VAPID Push | push | Free (FCM) | $0 | Platform admin |
| `dataseo` | DataForSEO | seo | Usage-based ~$50–300/mo | $50–300 | Platform admin |
| `twitter_x` | Twitter / X API | social | Basic tier $200/mo | $200 | Platform admin |
| `google_ads_api` | Google Ads API | ads | Free API calls (tenant funds ads) | $0 | Per-tenant |
| `meta_ads_api` | Meta Marketing API | ads | Free API calls (tenant funds ads) | $0 | Per-tenant |

Services marked "Per-tenant" are already handled per-org in `paid_ads_accounts`.
This system manages the **platform-level** services (rows 1–8).

---

## Step 22 — Platform Service Registry & Credential Vault

**Phase:** 6a · **Depends on:** Steps 1–21
**Migration:** `0017_create_platform_services.py` with `down_revision = "0016"`

### Backend — new model (`backend/app/models/platform_service.py`)

```python
class PlatformService(Base):
    __tablename__ = "platform_services"

    id: UUID  PK  default uuid4
    code: str          unique, max 50  # e.g. "sendgrid"
    name: str          max 100         # e.g. "SendGrid Email"
    category: str      max 30          # "payment"|"email"|"sms"|"social"|"push"|"seo"|"ads"
    description: str   nullable        # what this service does in the platform
    docs_url: str      nullable        # link to provider's API docs
    cost_model: str    max 200         # human-readable cost note
    est_monthly_usd: float  default 0  # estimated monthly USD cost for budgeting
    is_enabled: bool   default True    # False = force fake/sandbox mode even if creds exist
    is_live: bool      default False   # True = use real credentials; False = sandbox/fake
    credentials: JSONB nullable        # encrypted at application layer (see below)
    last_tested_at: DateTime nullable
    last_test_ok: bool nullable        # result of most recent connectivity test
    last_test_error: str nullable      # error message from last failed test
    created_at: DateTime server_default
    updated_at: DateTime server_default, onupdate now()
```

**Credential encryption:** Use Fernet symmetric encryption (from the `cryptography`
package, already installed for VAPID push). Store a `SERVICE_CRED_KEY` in `.env`
(generate once with `Fernet.generate_key()`). The JSONB column stores the Fernet
ciphertext as a base64 string. Provide two helpers:

```python
# backend/app/core/cred_crypto.py
def encrypt_creds(data: dict) -> str: ...   # dict → Fernet ciphertext string
def decrypt_creds(ciphertext: str) -> dict: # Fernet ciphertext → dict
```

If `SERVICE_CRED_KEY` is not set in `.env`, fall back to a dev-only key derived from
`settings.jwt_secret` (acceptable for local dev — warn loudly in logs).

### Migration 0017

```python
# 0017_create_platform_services.py
down_revision = "0016"

# Create table, then seed all 8 platform services with is_enabled=True,
# is_live=False (sandbox), credentials=NULL.
# Use op.bulk_insert() with the catalog above.
# Cost model and description strings should be useful to an admin reading them cold.
```

Seed values for `credentials` column: NULL (credentials must be entered via the admin UI).

### Backend — service credential reader (`backend/app/core/service_creds.py`)

```python
async def get_service(db: AsyncSession, code: str) -> PlatformService | None:
    """Returns the PlatformService row for this code."""

async def get_live_creds(db: AsyncSession, code: str) -> dict | None:
    """Returns decrypted credentials if service is enabled, is_live=True,
    and has credentials set. Returns None in any other case.
    Callers interpret None as 'use fake/sandbox mode'."""
```

### Backend — admin API (`backend/app/api/v1/admin_integrations.py`)

All routes require `InternalRole.STAFF` or `SUPERADMIN`.

```
GET  /admin/integrations
     → list[ServiceRead]  # all 8 services, credentials field NEVER returned

GET  /admin/integrations/{code}
     → ServiceRead  # same, no credentials

PATCH /admin/integrations/{code}
      body: { is_enabled?: bool, is_live?: bool, credentials?: dict,
              est_monthly_usd?: float, description?: str }
      → ServiceRead
      # encrypt credentials before storing; ignore credentials key if not present
      # (allows toggling is_live without re-entering creds)

POST /admin/integrations/{code}/test
     → { ok: bool, message: str, tested_at: str }
     # Runs a real connectivity check against the service API
     # Updates last_tested_at, last_test_ok, last_test_error on the DB row
     # Details for each service test: see Step 24

DELETE /admin/integrations/{code}/credentials
       → 204
       # Wipes stored credentials, sets is_live=False
```

### Backend — `ServiceRead` schema (`backend/app/schemas/platform_service.py`)

```python
class ServiceRead(BaseModel):
    id, code, name, category, description, docs_url, cost_model, est_monthly_usd
    is_enabled: bool
    is_live: bool
    has_credentials: bool  # True if credentials column is not NULL — never expose raw creds
    last_tested_at: datetime | None
    last_test_ok: bool | None
    last_test_error: str | None
    created_at, updated_at
```

Register in `backend/app/api/v1/__init__.py`.

**Definition of done:** `GET /v1/admin/integrations` returns all 8 services;
`PATCH /v1/admin/integrations/sendgrid` with `{"credentials": {"api_key": "SG.xxx"},
"is_live": true}` stores encrypted credentials; `GET` after that returns
`has_credentials: true, is_live: true`; the raw credentials are never returned.

---

## Step 23 — Credential-Backed Integration Clients

**Phase:** 6b · **Depends on:** Step 22

Update each integration client to read credentials from the `platform_services` DB
table (via `get_live_creds`) instead of from `settings.*` env vars.

### Refactoring pattern (apply to all 6 platform-level clients)

Each client currently reads from `settings` in its constructor. Change the pattern:

```python
# Before (current pattern in sendgrid.py, sslcommerz.py, etc.)
class SendGridClient:
    def __init__(self):
        self.api_key = settings.sendgrid_api_key   # hardcoded from env

# After
class SendGridClient:
    def __init__(self):
        pass  # no env read at construction time

    async def _creds(self, db: AsyncSession) -> dict | None:
        """Returns live creds from DB, or None if fake/sandbox mode."""
        return await get_live_creds(db, "sendgrid")

    async def send_email(self, db: AsyncSession, *, to_email, subject, html_body) -> str:
        creds = await self._creds(db)
        if creds is None:
            return f"fake-{uuid.uuid4().hex}"
        # real call using creds["api_key"]
```

**Apply this refactor to:**

| File | Code | Credential keys expected in DB |
|---|---|---|
| `app/integrations/sendgrid.py` | `sendgrid` | `api_key`, `from_email` |
| `app/integrations/sslcommerz.py` | `sslcommerz` | `store_id`, `store_password`, `sandbox_base_url` |
| `app/integrations/sslwireless.py` | `sslwireless` | `api_token`, `sender_id` |
| `app/integrations/meta.py` | `meta_social` | `access_token`, `page_id` |
| `app/integrations/linkedin.py` | `linkedin` | `access_token`, `org_urn` |
| `app/services/push_service.py` (VAPID section) | `firebase_vapid` | `vapid_public_key`, `vapid_private_key`, `vapid_subject` |

**Backward compatibility:** Keep reading `settings.*` as a fallback if
`get_live_creds` returns None AND the env var is not the placeholder. This means
existing deployments that set real keys in `.env` keep working without an admin
needing to re-enter creds in the UI on day one.

```python
async def _creds(self, db: AsyncSession) -> dict | None:
    # 1. Try DB first
    db_creds = await get_live_creds(db, "sendgrid")
    if db_creds is not None:
        return db_creds
    # 2. Fall back to env var if it's not the placeholder
    if not settings.sendgrid_is_fake:
        return {"api_key": settings.sendgrid_api_key, "from_email": settings.sendgrid_from_email}
    # 3. Fake mode
    return None
```

### Update all call sites

Every place that calls `sendgrid_client.send_email(...)`, `sslwireless_client.send_sms(...)`,
etc. must now pass `db` as the first argument. These are always called from route
handlers or service functions that already have `db: AsyncSession` in scope, so this
is a search-and-replace change, not a redesign.

Affected call sites:
- `app/services/campaign_service.py` → SendGrid
- `app/services/sms_service.py` → SSL Wireless
- `app/services/social_service.py` → Meta, LinkedIn
- `app/services/push_service.py` → VAPID/Firebase
- `app/api/v1/billing.py` → SSLCommerz (already has `db`)

**Definition of done:** with credentials stored in DB via Step 22 admin API and
`is_live=True`, sending an email campaign (Step 7) routes through the real SendGrid
API. With `is_live=False` or no credentials, it falls back to fake mode. No env var
change needed.

---

## Step 24 — Connectivity Tests Per Service

**Phase:** 6c · **Depends on:** Steps 22, 23

Implement `POST /admin/integrations/{code}/test` to actually verify the stored
credentials work. Each service has a different lightweight verification call:

| code | Test call | Success condition |
|---|---|---|
| `sendgrid` | `GET https://api.sendgrid.com/v3/user/credits` with `Authorization: Bearer {api_key}` | HTTP 200 |
| `sslcommerz` | Init a session with amount=1 BDT, dummy tran_id | SSLCommerz returns `status: SUCCESS` |
| `sslwireless` | `GET https://sms.sslwireless.com/pushapi/dynamic/server.php` with token, blank `msisdn` | HTTP 200 or known "invalid number" error (proves token accepted) |
| `meta_social` | `GET https://graph.facebook.com/v19.0/me?fields=id&access_token={token}` | HTTP 200 |
| `linkedin` | `GET https://api.linkedin.com/v2/me` with Bearer token | HTTP 200 |
| `firebase_vapid` | Try to instantiate a WebPush object with the stored VAPID keys | No exception raised |
| `dataseo` | `GET https://api.dataforseo.com/v3/appendix/user_data` with Basic auth `{login}:{password}` | HTTP 200 |
| `twitter_x` | `GET https://api.twitter.com/2/users/me` with Bearer token | HTTP 200 |

Implement each test in `backend/app/services/integration_test_service.py`:

```python
async def test_service(code: str, creds: dict) -> tuple[bool, str]:
    """Returns (ok, message). Called by the admin route."""
    if code == "sendgrid": ...
    elif code == "sslcommerz": ...
    # etc.
```

The route `POST /admin/integrations/{code}/test`:
1. Fetch the service row; if `has_credentials=False`, return `{"ok": false, "message": "No credentials stored"}`
2. Decrypt credentials
3. Call `test_service(code, creds)`
4. Update `last_tested_at`, `last_test_ok`, `last_test_error` on the DB row
5. Return `{"ok": bool, "message": str, "tested_at": ISO timestamp}`

**Definition of done:** `POST /admin/integrations/sendgrid/test` with valid stored
SendGrid credentials returns `{"ok": true, ...}`; with invalid credentials returns
`{"ok": false, "message": "HTTP 401 Unauthorized"}`; the result is visible on the
admin integration detail page.

---

## Step 25 — Admin Panel: Integration Hub UI

**Phase:** 6d · **Depends on:** Steps 22, 23, 24

### New admin panel page: `frontend/admin-panel/src/integrations/IntegrationHubPage.tsx`

**Add "Integrations" to the admin `AppLayout` nav** (alongside Tenants):

```typescript
// AppLayout.tsx header nav
<Link to="/integrations">Integrations</Link>
```

**Page layout:**

Top strip — cost summary:
- "Estimated Monthly Platform Cost: $X.XX / month" (sum of `est_monthly_usd` for
  all enabled + is_live services)
- Breakdown: Email $X | SMS ~BDT X | SEO $X | Social $0 | Push $0

Service cards grid (group by category):

Each card shows:
- Service name + category badge
- Status badge:
  - `Live` (green) — `is_enabled=True`, `is_live=True`, `has_credentials=True`, `last_test_ok=True`
  - `Sandbox` (yellow) — `is_enabled=True`, `is_live=False`
  - `Unconfigured` (gray) — `is_enabled=True`, `is_live=True`, `has_credentials=False`
  - `Disabled` (red) — `is_enabled=False`
- Estimated monthly cost: "$0" or "$200/mo"
- Last tested: "2 hours ago ✓" or "Never" or "3 days ago ✗ (error message)"
- Two buttons: "Configure" | "Test Now"

**Configure modal** (opens per service, fields depend on service code):

```typescript
const SERVICE_FIELDS: Record<string, { key: string; label: string; type: "text"|"password"; hint?: string }[]> = {
  sendgrid: [
    { key: "api_key",    label: "API Key",       type: "password", hint: "Starts with SG." },
    { key: "from_email", label: "From Email",     type: "text",     hint: "e.g. no-reply@yourdomain.com" },
  ],
  sslcommerz: [
    { key: "store_id",       label: "Store ID",       type: "text" },
    { key: "store_password", label: "Store Password", type: "password" },
    { key: "sandbox_base_url", label: "API Base URL", type: "text",
      hint: "https://sandbox.sslcommerz.com for sandbox; https://securepay.sslcommerz.com for live" },
  ],
  sslwireless: [
    { key: "api_token",  label: "API Token",  type: "password" },
    { key: "sender_id",  label: "Sender ID",  type: "text", hint: "e.g. LeadBangla" },
  ],
  meta_social: [
    { key: "access_token", label: "Page Access Token", type: "password", hint: "Long-lived token from Meta Developer console" },
    { key: "page_id",      label: "Facebook Page ID",  type: "text" },
  ],
  linkedin: [
    { key: "access_token", label: "Access Token", type: "password" },
    { key: "org_urn",      label: "Organization URN", type: "text", hint: "e.g. urn:li:organization:12345678" },
  ],
  firebase_vapid: [
    { key: "vapid_public_key",  label: "VAPID Public Key",  type: "text" },
    { key: "vapid_private_key", label: "VAPID Private Key", type: "password" },
    { key: "vapid_subject",     label: "VAPID Subject (mailto:)", type: "text" },
  ],
  dataseo: [
    { key: "login",    label: "DataForSEO Login",    type: "text" },
    { key: "password", label: "DataForSEO Password", type: "password" },
  ],
  twitter_x: [
    { key: "bearer_token",      label: "Bearer Token",       type: "password" },
    { key: "api_key",           label: "API Key",             type: "password" },
    { key: "api_secret",        label: "API Secret",          type: "password" },
    { key: "access_token",      label: "Access Token",        type: "password" },
    { key: "access_token_secret", label: "Access Token Secret", type: "password" },
  ],
};
```

Modal actions:
- "Save Credentials" → `PATCH /admin/integrations/{code}` with `{credentials: {...}}`
- "Go Live" toggle → `PATCH /admin/integrations/{code}` with `{is_live: true/false}`
- "Enable / Disable" toggle → `PATCH /admin/integrations/{code}` with `{is_enabled: bool}`
- "Clear Credentials" → `DELETE /admin/integrations/{code}/credentials` after confirm
- "Test Connection" (in modal and on card) → `POST /admin/integrations/{code}/test`
  → shows spinner → shows OK/error inline

**Docs link** under each service name: opens `docs_url` in a new tab. Include docs
URLs in the seed data:
- SSLCommerz: `https://developer.sslcommerz.com/doc/v4/`
- SendGrid: `https://docs.sendgrid.com/api-reference/`
- SSL Wireless: `https://sms.sslwireless.com/pushapi/`
- Meta Graph API: `https://developers.facebook.com/docs/graph-api/`
- LinkedIn: `https://learn.microsoft.com/en-us/linkedin/marketing/`
- Firebase/VAPID: `https://firebase.google.com/docs/cloud-messaging`
- DataForSEO: `https://docs.dataforseo.com/`
- Twitter/X: `https://developer.twitter.com/en/docs/twitter-api`

### Admin panel lib (`frontend/admin-panel/src/lib/integrations.ts`)

```typescript
export interface PlatformService {
  id: string; code: string; name: string; category: string;
  description: string | null; docs_url: string | null;
  cost_model: string; est_monthly_usd: number;
  is_enabled: boolean; is_live: boolean; has_credentials: boolean;
  last_tested_at: string | null; last_test_ok: boolean | null;
  last_test_error: string | null;
}
export interface TestResult { ok: boolean; message: string; tested_at: string; }

export async function listServices(): Promise<PlatformService[]>
export async function updateService(code: string, patch: Partial<{
  is_enabled: boolean; is_live: boolean; credentials: Record<string, string>;
  est_monthly_usd: number;
}>): Promise<PlatformService>
export async function testService(code: string): Promise<TestResult>
export async function clearCredentials(code: string): Promise<void>
```

### Admin panel routing

```tsx
// App.tsx
import IntegrationHubPage from "./integrations/IntegrationHubPage";
<Route path="/integrations" element={<IntegrationHubPage />} />
```

**Definition of done:** opening `/integrations` in the admin panel shows all 8
services with their status; entering SendGrid credentials, clicking "Save", then
"Test Connection" shows a green "Connected" result and updates `last_tested_at`;
toggling "Go Live" makes `sendgrid.is_live = true`; subsequent email campaigns use
the real SendGrid API without any env var change.

---

## Step 26 — DataForSEO & Twitter/X Activation (Deferred Services)

**Phase:** 6e · **Depends on:** Steps 22–25

These two services were explicitly deferred in `prompt.md` (Steps 9 and 15).
Now that credentials can be managed via the Integration Hub, build the actual
integration code so an admin can activate them by entering credentials in the UI.

### DataForSEO (`seo_advanced` capability)

Add to `backend/app/services/seo_service.py`:

```python
async def rank_tracking(db: AsyncSession, org_id: UUID, domain: str, keywords: list[str]) -> list[dict]:
    """Calls DataForSEO SERP API for keyword rank data.
    Falls back to {} if dataseo service is not live."""
    creds = await get_live_creds(db, "dataseo")
    if creds is None:
        return []  # graceful degradation — no data, not an error
    # POST https://api.dataforseo.com/v3/serp/google/organic/live/regular
    # Basic auth: creds["login"]:creds["password"]
    # Returns list of {keyword, rank, url, search_volume}

async def backlink_analysis(db: AsyncSession, org_id: UUID, domain: str) -> dict:
    """Calls DataForSEO Backlinks API. Falls back to {} if not live."""
    creds = await get_live_creds(db, "dataseo")
    if creds is None:
        return {}
    # POST https://api.dataforseo.com/v3/backlinks/summary/live
    # Returns {total_backlinks, referring_domains, rank}
```

Add two new routes to `backend/app/api/v1/seo.py`:
```
POST /seo/rank-tracking   body: {domain, keywords: list[str]}   → list of rank rows
POST /seo/backlinks       body: {domain}                         → backlink summary
```

These routes return the DataForSEO data when credentials are configured and `is_live`,
or return `{"data": [], "message": "DataForSEO not configured — enter credentials in admin Integrations."}` when not. No HTTP error — graceful empty state.

Add a "Rank Tracking" section to the existing `SeoPage.tsx` in main-app:
- Input: domain + comma-separated keywords
- "Analyze" button → calls new endpoint
- Results table: Keyword | Current Rank | URL | Monthly Search Volume
- Empty state shows info banner: "Configure DataForSEO in the admin panel to enable rank tracking."
- No upgrade prompt, no paywall — this feature is unlocked the moment the admin
  enters DataForSEO credentials in the Integration Hub.

### Twitter/X (`social_x` capability)

Add `backend/app/integrations/twitter.py`:

```python
class TwitterClient:
    """Twitter/X API v2 integration for tweet publishing.

    Set credentials via admin Integration Hub (code: twitter_x).
    Cost: $200/mo Basic tier — only activate when commercial need justifies it.
    """
    API_URL = "https://api.twitter.com/2"

    async def publish_tweet(self, db: AsyncSession, *, text: str) -> str:
        """Returns tweet ID or fake ID if not configured."""
        creds = await get_live_creds(db, "twitter_x")
        if creds is None:
            return f"fake-tweet-{uuid.uuid4().hex}"
        # POST /2/tweets with OAuth 1.0a user context
        # Headers: OAuth signed with api_key, api_secret, access_token, access_token_secret
        # Body: {"text": text}
        # Returns: {"data": {"id": "...", "text": "..."}}

    async def get_tweet_stats(self, db: AsyncSession, *, tweet_id: str) -> dict:
        """Returns {likes, retweets, replies} or zeros if not configured."""
        creds = await get_live_creds(db, "twitter_x")
        if creds is None:
            return {"likes": 0, "retweets": 0, "replies": 0}
        # GET /2/tweets/{id}?tweet.fields=public_metrics
        # Returns public_metrics: {like_count, retweet_count, reply_count}

twitter_client = TwitterClient()
```

Add `x` to `SocialPlatform` enum (if not already there):
```python
class SocialPlatform(str, enum.Enum):
    ...
    X = "x"
```

Extend `social_service.py` to dispatch to `twitter_client` when `platform == "x"`.

Extend the Social page (`SocialPage.tsx`) platform selector to include "X (Twitter)"
alongside Facebook/Instagram/LinkedIn. When selected and posting fails (fake mode),
show the info banner: "Twitter/X posting is not configured. Enter credentials in
admin → Integrations."

**Definition of done:** entering DataForSEO credentials in the Integration Hub and
enabling live mode makes `POST /v1/seo/rank-tracking` return real rank data; entering
Twitter/X credentials makes social posts to platform "x" publish real tweets.

---

## Step 27 — Cost & Usage Monitor Dashboard (Admin)

**Phase:** 6f · **Depends on:** Steps 22–26

### Backend — usage data endpoints (`backend/app/api/v1/admin_integrations.py`)

Add to the existing admin integrations router:

```
GET /admin/integrations/cost-summary
→ {
    total_est_monthly_usd: float,
    total_est_monthly_bdt: float,  # use exchange rate 110 BDT/USD as a constant
    services: list[{
      code, name, category,
      is_live: bool,
      est_monthly_usd: float,
      usage_this_month: int | null,   # emails sent / SMS sent / API calls (if trackable)
      usage_label: str | null,        # "emails" / "SMS messages" / "API calls"
    }]
  }

GET /admin/integrations/usage?code={service_code}&days=30
→ list[{ date: str, count: int }]   # daily usage for the service
  # Derive from existing tables:
  #   sendgrid   → count Event rows (type=SENT) per day
  #   sslwireless → count SmsEvent rows (type=SENT) per day
  #   sslcommerz  → count Subscription rows (status=ACTIVE) per day
  #   meta_social / linkedin / twitter_x → count SocialPost rows (status=PUBLISHED) per day
  #   firebase_vapid → count PushCampaign sends per day
  # For dataseo / google_ads_api / meta_ads_api: return [] (no server-side tracking yet)
```

### Admin panel — extend `IntegrationHubPage.tsx`

Add a "Cost Monitor" tab at the top of the page (alongside an "All Services" tab):

**Cost Monitor tab:**
- Bar of estimated monthly platform cost: `$X.XX / month` total
- Per-service breakdown table:
  - Service | Status | Est. Cost | Usage This Month | Cost per unit
  - e.g. SendGrid | Live | $19.95/mo | 4 832 emails | —
  - e.g. SSL Wireless | Sandbox | ~BDT 200 | 412 SMS | ~0.49 BDT/SMS
  - e.g. Twitter/X | Disabled | $200/mo | — | —
- Yellow warning icon on any service where `est_monthly_usd > 0` and `is_live=False`
  (reminder: "This service has a cost — check if it should be Live or can be disabled")
- "Edit Cost" pencil icon per row → inline edit of `est_monthly_usd` → PATCH
  (useful when the actual invoice differs from the estimate)
- Usage sparkline (7-day) for services with usage data (sendgrid, sslwireless, etc.)
  using a simple SVG line chart — no charting library

**Definition of done:** the Cost Monitor tab shows a correct total estimated monthly
cost summing only live-enabled services; the SendGrid usage chart shows real email
send counts from the Event table; editing a cost estimate updates it immediately.

---

## Step 28 — Tenant: Integration Status View (main-app)

**Phase:** 6g · **Depends on:** Steps 22, 25

Tenants cannot configure platform services — that's the admin's job. But tenants
should be able to see which platform services are active for them, so they know
whether email/SMS/push is really going out or running in sandbox mode.

### Backend — tenant-facing endpoint

Add to `backend/app/api/v1/billing.py` (or a new `platform_status.py`):

```
GET /platform/status   (requires tenant auth)
→ list[{
    category: str,    # "email" | "sms" | "social" | "push" | "seo" | "ads"
    name: str,
    status: "live" | "sandbox" | "disabled",
    note: str | null  # e.g. "Sandbox mode — sends are simulated" or null
  }]
```

This endpoint queries `PlatformService` but only returns `category`, `name`, and a
derived `status` — no credentials, no cost data, no internal details.

### Frontend — settings page integration status section

Add a new section to the existing Settings page in main-app (or a new sub-tab
"Integrations") that renders the list:

```
Email (SendGrid)       ● Live
SMS (SSL Wireless)     ◐ Sandbox  — Sends are simulated in sandbox mode
Social (Meta)          ● Live
Social (LinkedIn)      ◐ Sandbox
Push (VAPID)           ● Live
SEO (DataForSEO)       ○ Disabled — Rank tracking requires DataForSEO setup
Twitter/X              ○ Disabled — Contact support to activate
```

Color coding:
- `live` → green dot
- `sandbox` → yellow dot with note
- `disabled` → gray dot with note

No action buttons — tenants cannot change these. Note at bottom:
"To enable a service, contact your platform admin."

**Definition of done:** a tenant visiting Settings sees the current status of each
platform service; toggling SSLCommerz from sandbox to live in the admin Integration Hub
is reflected immediately (no cache) in the tenant status view.

---

## Deployment & Migration Notes

### Environment changes needed

Add one new variable to `.env` after Step 22:

```env
# Fernet key for encrypting service credentials in the DB.
# Generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# If not set, a dev-only fallback is derived from JWT_SECRET (not safe for production).
SERVICE_CRED_KEY=your-fernet-key-here
```

### Migration execution order

```bash
docker compose exec backend alembic upgrade head
# Runs 0017_create_platform_services (creates table + seeds 8 service rows)
```

### Hot-patch order (Steps 22–28)

1. `docker compose cp` all new Python files to `backend:/app/app/...`
2. `docker compose exec backend alembic upgrade head` (migration 0017)
3. `docker compose restart backend`
4. `docker compose exec backend sh -c "find /app/app -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null"`
5. Rebuild and redeploy admin-panel frontend for new Integration Hub pages:
   `docker compose up -d --build admin-panel && docker compose restart proxy`

### Backward compatibility guarantee

After these steps, the platform works identically to before with zero admin action:
- All `is_live=False` in the DB → all clients fall back to env var → same behavior as pre-Step-22
- Admin enters credentials via UI → toggles `is_live=True` → service goes live
- No `.env` edits needed after Step 22 is deployed
