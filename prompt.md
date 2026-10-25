# LeadBangla — Step-by-Step Build Prompt

Execution order for `plan.md`, re-sequenced so that the only thing pushed to
the very end is **Paid Ads / PPC Management** — the one module that needs
real ad spend (the customer's money, not ours, per `budget.md`) flowing
through a live Google/Meta Ads account before it can be meaningfully built
or tested. Everything else — including Stripe in test mode and Twilio on
trial credits — proceeds in its normal phase order, since neither requires
spending real money to build and verify.

Each step below is self-contained: implement it, verify the "Definition of
done," then move to the next. Don't start a step until its dependencies are
checked off.

**Operational note, relevant from Step 1 onward:** Nginx caches the
container IP of `main-app`/`admin-panel` the first time it resolves them.
Rebuilding either container gives it a new IP, and Nginx keeps talking to
the old one until it's restarted — symptom is a 502 on routes that were
working a minute ago. After `docker compose up -d --build main-app` (or
`admin-panel`), always follow with `docker compose restart proxy`.

---

## Step 1 — Repo & infra scaffolding
**Phase:** 0a · **Depends on:** nothing

- Create `backend/` (FastAPI + SQLAlchemy + Alembic skeleton), `frontend/main-app/`
  and `frontend/admin-panel/` (Vite + React + TS), `docker-compose.yml` wiring
  Postgres, Redis, backend, both frontends behind Nginx/Traefik.
- `pyproject.toml`, base FastAPI app with a `/health` route, base React app
  shells with routing.

**Definition of done:** `docker compose up` boots all services; `/health`
returns 200; both React shells render a blank page through the proxy.

## Step 2 — Self-serve signup + auth
**Phase:** 0b · **Depends on:** Step 1

- Public signup: anyone can create a `User` account (email/password or OAuth)
  with **no Organization yet** — org creation is deferred to Step 4
  (onboarding), gated behind Step 3 (subscribe).
- JWT access + refresh tokens. Internal staff/superadmin accounts are
  provisioned separately (seed/admin tool), not through this public flow.
- Roles (`owner/admin/member` for tenants, `staff/superadmin` for internal)
  are defined now but only become meaningful once an Organization exists.
- Signup isn't the public entry point on its own — `/` is a marketing
  landing page (built in Step 6.6) that visitors see first; signup is what
  they land on after choosing a plan there, or via a plain "Sign up" link
  if they skip pricing.

**Definition of done:** anyone can sign up and log in and reach an
authenticated "pick a plan" screen; no Organization or tenant data exists
for them yet.

## Step 3 — Subscribe (SSLCommerz, sandbox mode)
**Phase:** 0c · **Depends on:** Step 2

- Immediately after signup, the user picks a plan and subscribes — this is
  the gate before onboarding, not an afterthought bolted on post-org. Two
  entry paths feed the same `/billing/subscribe` call: (a) a plan was
  already chosen on the Step 6.6 marketing page and carried through signup
  via a query param, so checkout fires automatically right after account
  creation with no extra click; (b) someone signed up without picking a
  plan first and lands on a "pick a plan" screen instead. Build (b) first
  since (a) depends on Step 6.6 existing — but design `/billing/subscribe`
  to not care which path called it.
- Built for the BD market: **SSLCommerz** sandbox API (covers cards, bKash,
  Nagad, Rocket, Upay, internet banking under one integration) — no live
  merchant account or card needed yet. Subscription plan models priced in
  **BDT**, checkout/webhook handling, plan-gated feature flags keyed off the
  `User` (not yet an Organization, since none exists).
- Cost: $0 in sandbox. Going live later needs a registered Trade License +
  TIN to onboard as an SSLCommerz merchant, plus ~2.5–3.5%+VAT per
  transaction (per `budget.md`) — that paperwork can start in parallel now,
  it just isn't a blocker for building/testing this step.

**Definition of done:** a signed-up user with no Organization can subscribe
to a BDT-priced plan end-to-end via SSLCommerz sandbox test payment methods,
and an unsubscribed user is blocked from reaching onboarding.

## Step 4 — Onboarding → creates the Organization
**Phase:** 0d · **Depends on:** Step 3

- Onboarding wizard runs right after a successful subscription: collects org
  name/basic settings, **preferred language (bn/en)**, creates the
  `Organization`, makes the subscribing user its `owner`, and links the
  Step 3 subscription to that org.
- From this point on, every query path is scoped by `organization_id` at the
  service layer (not just route handlers) — this is the one architectural
  rule to get right before any feature work builds on top of it.

**Definition of done:** completing onboarding creates an org owned by the
subscriber, with a stored language preference; a second subscribed user
completing their own onboarding gets a separate org, and neither can read
the other's data.

## Step 5 — Admin panel basics
**Phase:** 0e · **Depends on:** Step 4

- Tenant list, org detail/impersonation, basic support tools in
  `frontend/admin-panel`.
- Reached at its own port (5174 in dev; its own subdomain/port in prod) —
  not proxied under the main app's `/admin/` path. A path prefix would
  require the SPA router and Vite's asset base to agree on that prefix,
  which conflicts with direct-port access; a separate origin avoids that
  entirely and matches `plan.md`'s intent to keep the admin panel isolated
  from the main app's deploy pipeline.

**Definition of done:** internal staff role can list all tenants and
impersonate a tenant user for support purposes; tenant users cannot reach
this app.

## Step 6 — Audience: Contact + Segmentation
**Phase:** 1a · **Depends on:** Step 4

- `Contact` model (shared primitive used by Email/SMS/CRM/Push/Segmentation),
  `Segment` as a saved filter over Contacts. CSV import as the first
  contact-creation path.

**Definition of done:** import a CSV of contacts, build a segment with at
least one filter rule, see the matching contact count update live.

## Step 6.5 — Design pass + seed data
**Phase:** 1a (cross-cutting) · **Depends on:** Step 6

Steps 2–6 were deliberately built unstyled (plain HTML elements, no Tailwind)
so the auth → subscribe → onboard → audience flow could be verified
functionally first — see the "Styling timing" decision earlier in this
build. Now that flow works end-to-end, do one dedicated pass across
everything built so far rather than styling page-by-page as new steps land.

- **Design:** wire up Tailwind (already named in `plan.md`'s stack) in both
  `frontend/main-app` and `frontend/admin-panel` — `tailwind.config.js`,
  `postcss.config.js`, base stylesheet import in `main.tsx`. Apply a
  consistent modern look across every page built in Steps 2–6: Home,
  Signup, Login, Pick a plan, Onboarding, Dashboard, Contacts, Segments,
  checkout success/cancel, impersonate-landing — plus admin-panel's Login,
  Tenant list, Tenant detail. Pull shared pieces (`Button`, `Input`,
  `Select`, `Card`, `AuthLayout`, `AppLayout`) into `main-app/src/components/`
  (mirrored locally in `admin-panel/src/components/` — separate app,
  separate deploy pipeline, so no shared package between them) so ~10 pages
  aren't repeating the same Tailwind class strings.
  **The two apps should look deliberately different, not like the same
  template with a different logo** — main-app is the customer-facing
  product (bright, consumer-SaaS visual language) and admin-panel is an
  internal tool (should read as such at a glance). Concretely: main-app's
  auth pages use a bright split-screen layout (gradient brand panel +
  white form panel); admin-panel's login uses a dark theme (slate
  background, emerald accent) with an "Internal Admin" label, so nobody
  mistakes one app for the other from a screenshot.
- **Seed data:** a `app/scripts/seed_demo_data.py`, idempotent like Step 5's
  `create_internal_user.py`, that in one run creates: the internal
  superadmin login (or reuses it if already provisioned), 2–3 demo tenant
  users already fully subscribed *and* onboarded (skips the manual
  signup→subscribe→onboard click-through), and sample contacts + 1–2
  segments per demo org so Contacts/Segments aren't empty on first login.
  Print the created credentials to stdout, **and prefill the login forms in
  both `main-app` and `admin-panel` with those same seeded credentials** as
  the input boxes' default values — reviewing the UI should be "open the
  page, click log in," not "go copy a password out of a terminal first."

**Definition of done:** every page from Steps 2–6 renders with consistent
spacing/typography/color instead of unstyled browser defaults, and the two
apps are visually distinguishable from each other at a glance; running the
seed script once against a fresh `docker compose up` leaves the app fully
demoable (admin login, a subscribed+onboarded tenant login with non-empty
Contacts/Segments) with no manual click-through setup, and both login pages
load with working credentials already typed in.

## Step 6.6 — Marketing landing page + plan-first signup
**Phase:** 1a (cross-cutting) · **Depends on:** Step 6.5

Steps 2–6.5 treated `/` as a bare placeholder and signup as the de facto
entry point. That's backwards for a real SaaS funnel: a visitor should land
on a marketing page that explains the product and shows pricing, *then*
choose a plan, *then* register — not register first and find out what
they're buying afterward.

- Replace the placeholder Home with a real landing page: hero section,
  feature highlights (pulled from `plan.md`'s module list — describe the
  platform's direction, don't overclaim modules that aren't built yet),
  and a pricing section that fetches real plans from the already-public
  `GET /v1/billing/plans` (no auth required) and renders them as cards.
- Each plan card's CTA links to `/signup?plan=<plan_id>` — the chosen plan
  rides along as a query param. `SignupPage` reads it: if present, it calls
  `/billing/subscribe` for that exact plan immediately after account
  creation and redirects straight to checkout, skipping a redundant
  "pick a plan again" screen. If someone reaches signup without a plan
  param (e.g. a bare `/signup` link), it falls back to Step 3's "pick a
  plan" screen exactly as before — that path isn't being removed, just no
  longer the only path in.
- As later steps ship customer-facing modules (Email in Step 7, SMS in
  Step 10, etc.), add them to the landing page's feature list so marketing
  copy doesn't silently fall behind what's actually shipped.

**Definition of done:** visiting `/` shows a real marketing page with live
BDT pricing pulled from the API; clicking a plan's CTA, signing up, and
landing in checkout for *that exact plan* works with no manual plan
re-selection; a bare `/signup` visit (no plan param) still falls back to
the Step 3 "pick a plan" screen correctly.

## Conventions for Step 7 onward

Steps 2–6 were built unstyled on purpose (verify the flow first, design
later — see Step 6.5). That phase is over. Every step from here on ships
**styled and demoable from day one**, not "functional now, pretty later":

- **Use the design system, don't reinvent it.** Any new page reuses
  `Button`/`Input`/`Select`/`Card`/`AppLayout` (or `AuthLayout` for
  standalone forms) from `main-app/src/components/`. If a step needs a
  component that doesn't exist yet (e.g. a date picker for Step 9's content
  calendar), add it there once and reuse it — don't hand-roll styling
  per-page.
- **Extend the seed script, don't leave it behind.** Each step that adds a
  new entity (campaigns in Step 7, social posts in Step 9, workflows in
  Step 12, etc.) adds a corresponding fixture to
  `app/scripts/seed_demo_data.py` so the demo tenants from Step 6.5 keep
  having non-empty, representative data for that feature too. By the time
  Step 21 ships, running the seed script once should populate a tenant
  that looks like it's been live for months, not one that's empty except
  for whatever the most recent step added.
- **Keep the landing page (Step 6.6) honest.** When a step ships a
  customer-facing module, add it to the landing page's feature list in the
  same step — don't let marketing copy and shipped reality drift apart.
- **Restart `proxy` after rebuilding a frontend container** — see the
  operational note after the intro at the top of this file. Easy to forget
  mid-step and waste time debugging a phantom 502.

## Step 7 — Email Marketing
**Phase:** 1b · **Depends on:** Step 6

- `Campaign` (type=email) + template editor + send pipeline through Celery.
- Provider: SendGrid free tier (100 emails/day, no card required) to start —
  matches "free things" without needing Mailgun/SES setup yet.
- Opens/clicks tracking via webhook → `Event` table.

**Definition of done:** send a test campaign to a segment via SendGrid free
tier, see open/click events land in the `Event` table.

## Step 8 — Basic Analytics dashboard
**Phase:** 1c · **Depends on:** Step 7

- Per-campaign stats view in `main-app`: sent/opened/clicked, reading
  straight from the `Event` table — no new third-party dependency.

**Definition of done:** dashboard shows correct counts for the test campaign
sent in Step 7.

## Step 9 — Social Media scheduling + publishing
**Phase:** 2a · **Depends on:** Step 6

- Start with **Meta Graph API (Facebook/Instagram)** and **LinkedIn Marketing
  API** — both free, no per-call fee (per `budget.md`). LinkedIn needs
  Marketing Developer Platform approval (free, but adds lead time — apply
  early in this step, don't block other work on it).
- Content calendar UI, scheduled publish via Celery, basic engagement stats
  pull-back.
- **Flag, don't build yet:** X (Twitter) API Basic tier is $200/mo minimum —
  defer adding X until there's a customer commercial reason to justify that
  line item; TikTok needs app review (free, but lead-time gated like
  LinkedIn).

**Definition of done:** a post scheduled in the calendar publishes to a
connected Meta and/or LinkedIn account at the scheduled time.

## Step 10 — SMS & WhatsApp Marketing
**Phase:** 2b · **Depends on:** Step 6

- Built for the BD market: a local SMS/WhatsApp gateway (e.g. **SSL
  Wireless** or **BulkSMSBD**, acting as the Meta-approved BSP for
  WhatsApp) rather than Twilio — cheaper per-message (~0.20–0.50 BDT/SMS vs.
  Twilio's $0.0079) and routes through a BTRC-recognized aggregator, which
  Twilio doesn't.
- Build against the aggregator's sandbox/test credentials first; sending
  live commercial bulk SMS/WhatsApp requires a BTRC Masking/Non-masking ID
  tied to the same Trade License + TIN needed for Step 3 — start that
  paperwork in parallel, it doesn't block building this step.
- Opt-in management is mandatory here, not optional — build it alongside
  sending, not after.

**Definition of done:** send a test SMS to your own verified number via the
aggregator's sandbox credentials; an opted-out contact is provably excluded
from sends.

## Step 11 — Landing Page & Form Builder
**Phase:** 2c · **Depends on:** Step 6

- Drag-and-drop builder (custom-built — no third-party fee either way; this
  is a dev-time sink, not a cost-budget one) feeding form submissions
  straight into `Contact`.

**Definition of done:** a published landing page form submission creates a
new Contact and appears in the relevant segment.

## Step 12 — Marketing Automation / Workflows engine
**Phase:** 3a · **Depends on:** Steps 7, 10

- Trigger-based journeys (signup, abandoned cart, etc.), if/then branching,
  steps that can call into Email/SMS campaigns already built. Pure internal
  logic — no new third-party cost.

**Definition of done:** a signup trigger fires a 2-step journey (email, then
delayed SMS) for a test contact.

## Step 13 — CRM & Lead Management
**Phase:** 3b · **Depends on:** Step 6

- Pipeline stages, lead scoring, contact timeline aggregating events from
  Email/SMS/Social/Forms. Internal only — no new third-party cost.

**Definition of done:** a contact's timeline shows entries from at least two
different channels (e.g. email open + form submission).

## Step 14 — Cross-channel reporting/attribution
**Phase:** 3c · **Depends on:** Steps 8, 9, 10, 12

- Extend the analytics dashboard across channels using the now-larger
  `Event` table. No new third-party dependency.

**Definition of done:** one dashboard view shows campaign performance across
email, SMS, and social side by side for the same date range.

## Step 15 — SEO Marketing
**Phase:** 4a · **Depends on:** Step 4

- This is the one non-Ads module with a real recurring cost if you use a
  data provider (DataForSEO ~$50–300/mo). To keep this free for as long as
  possible: start with a **self-built crawler** for on-page audits (no
  external fee) and defer rank-tracking/backlink data (which realistically
  requires a paid provider) until there's budget or a customer asking for it.

**Definition of done:** on-page audit runs against a tenant's own site and
surfaces basic issues (missing meta tags, broken links, etc.) with zero
third-party API cost.

## Step 16 — Content Marketing calendar
**Phase:** 4b · **Depends on:** Step 9

- Editorial calendar, content briefs, status workflow (idea → draft →
  review → published). Internal only.

**Definition of done:** a content item moves through all four statuses and
links to a published social post or landing page from earlier steps.

## Step 17 — Affiliate & Referral Marketing
**Phase:** 5a · **Depends on:** Step 6

- Affiliate links, commission tracking, referral program management. No
  third-party API required for a first version — commission math and link
  tracking are internal.

**Definition of done:** a referral link click is attributed to a contact and
a commission record is generated on conversion.

## Step 18 — Influencer Marketing
**Phase:** 5b · **Depends on:** Step 6

- Influencer database, outreach tracking, deliverables/ROI. Internal only.

**Definition of done:** an influencer record tracks at least one deliverable
through to a logged outcome (clicks/conversions from Step 17's link
tracking).

## Step 19 — Push Notifications
**Phase:** 5c · **Depends on:** Step 6

- Firebase Cloud Messaging — free and unlimited for push delivery itself
  (per `budget.md`). Skip OneSignal's paid segmentation UI; reuse the
  Segment model already built in Step 6 instead.

**Definition of done:** a push notification sent via FCM reaches a test
device/browser, scoped to a segment.

## Step 20 — Event Marketing
**Phase:** 5d · **Depends on:** Steps 7, 10, 12

- Webinar/event creation, registration, reminder sequences (reuse the
  Workflows engine from Step 12), attendance tracking. Internal only.

**Definition of done:** registering for a test event triggers a reminder
sequence and marks attendance on the event date.

## Step 21 (last) — Paid Ads / PPC Management
**Phase:** 4 (deliberately moved to last) · **Depends on:** Steps 8, 14

- Google Ads API + Meta Marketing API integration. The APIs themselves are
  free to call (per `budget.md`) — what makes this last is that meaningful
  end-to-end testing needs a live ad account with **real ad spend**, which
  is the customer's money, not a dev cost, but still requires an actual
  funded ad account to validate budget sync, spend tracking, and
  performance pull-back against.
- Build campaign creation, budget/spend tracking, and performance sync
  reusing the cross-channel reporting from Step 14.

**Definition of done:** a campaign created through the platform appears in
the connected Google/Meta Ads account, and spend + performance data syncs
back into the cross-channel dashboard — verified against a small real
budget (e.g. $5–10) rather than mocked data.

---

## Cost checkpoints (cross-reference `budget.md`)

- Through **Step 20**, the only recurring real-money line items are
  optional: local SMS/WhatsApp gateway usage past sandbox (Step 10), and
  SendGrid past the free 100/day tier (Step 7) if volume grows. Everything
  else is free or sandbox/test-mode.
- **Step 21** is the only step gated on a funded, live ad account.
- X (Twitter) API ($200/mo) and SEO rank-tracking data providers
  (~$50–300/mo) are flagged as deferred-by-default inside Steps 9 and 15 —
  revisit only when a customer need justifies the recurring cost.
- **BD-specific gate, applies to Steps 3 and 10 only:** going live (not
  sandbox) on SSLCommerz billing and local SMS/WhatsApp both require a
  registered Trade License + TIN, and SMS/WhatsApp additionally needs a
  BTRC Masking/Non-masking ID. This is one-time paperwork with multi-week
  lead time, not engineering work — start it during Phase 0 so it's ready
  by the time Steps 3 and 10 need to flip from sandbox to live.
