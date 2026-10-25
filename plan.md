# LeadBangla — Product & Build Plan

## 1. What this is

A multi-tenant SaaS platform that lets businesses plan, execute, automate, and
measure marketing campaigns across every major channel from one place. Each
customer (tenant) gets their own workspace; internal staff manage the
platform itself through a separate admin panel.

## 2. Marketing types this app will handle

| # | Module | What it covers |
|---|--------|-----------------|
| 1 | **Email Marketing** | Newsletters, drip sequences, transactional templates, list management, A/B subject testing |
| 2 | **Social Media Marketing** | Multi-platform post scheduling (FB/IG/X/LinkedIn/TikTok), content calendar, engagement stats |
| 3 | **SMS & WhatsApp Marketing** | Bulk SMS/WhatsApp campaigns, opt-in management, delivery tracking |
| 4 | **Paid Ads / PPC Management** | Google Ads & Meta Ads campaign creation, budget/spend tracking, performance sync |
| 5 | **SEO Marketing** | Keyword tracking, on-page audits, backlink monitoring, rank history |
| 6 | **Content Marketing** | Editorial calendar, blog/content briefs, content status workflow (idea → draft → review → published) |
| 7 | **Landing Page & Form Builder** | Drag-and-drop landing pages, lead-capture forms, embeddable widgets |
| 8 | **Marketing Automation / Workflows** | Trigger-based journeys (signup, abandoned cart, etc.), if/then branching, multi-channel sequences |
| 9 | **CRM & Lead Management** | Lead capture, scoring, pipeline stages, contact timeline |
| 10 | **Affiliate & Referral Marketing** | Affiliate links, commission tracking, referral program management |
| 11 | **Influencer Marketing** | Influencer database, outreach tracking, campaign deliverables & ROI |
| 12 | **Push Notification Marketing** | Web & mobile push campaigns, segmentation, scheduling |
| 13 | **Event Marketing** | Webinar/event creation, registration, reminder sequences, attendance tracking |
| 14 | **Analytics & Reporting** | Cross-channel dashboard, campaign ROI, attribution, exportable reports |
| 15 | **Audience Segmentation** | Tags, custom fields, dynamic segments reused across all channels above |

> Build order matters more than coverage — see Roadmap (Section 6). Not all
> 15 modules ship at once.

## 3. Tech stack

- **Backend:** Python, **FastAPI** (async), PostgreSQL, Redis (cache + queue
  broker), Celery (or RQ) for background jobs and scheduled sends, SQLAlchemy
  + Alembic for ORM/migrations.
- **Frontend (Main App):** **React** (Vite + TypeScript), Tailwind, React
  Query for data fetching, Zustand/Redux for local state.
- **Frontend (Admin Panel):** Separate **React** app — internal tool for
  staff (tenant management, billing oversight, support, feature flags,
  system health). Kept isolated from customer-facing code and deploy
  pipeline.
- **Auth:** JWT access/refresh tokens issued by the FastAPI backend;
  role-based access control (tenant owner/admin/member vs. internal
  staff/superadmin).
- **Billing:** Built for the Bangladesh market — **SSLCommerz** (aggregator
  covering cards, bKash, Nagad, Rocket, Upay, internet banking) for
  subscriptions and usage-based add-ons (e.g. SMS credits), billed in BDT.
  Requires a registered business (Trade License + TIN) to onboard as a live
  merchant; sandbox API available before that's in place.
- **Localization:** BDT as the default currency across billing/reporting;
  Bangla (bn) supported alongside English in both the main app and the
  admin panel.
- **Infra:** Docker Compose for local dev; one container per app
  (backend, main-app, admin-panel) behind a reverse proxy (Nginx/Traefik).

## 4. Repository layout

```
marketing_manager/
├── backend/                  # FastAPI app
│   ├── app/
│   │   ├── api/              # versioned routers (v1/email, v1/social, ...)
│   │   ├── core/             # config, security, deps
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # business logic per marketing module
│   │   ├── integrations/     # third-party API clients (Meta, Google, Twilio, SendGrid...)
│   │   ├── workers/          # Celery tasks (scheduled sends, sync jobs)
│   │   └── main.py
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
│
├── frontend/
│   ├── main-app/              # customer-facing React SaaS app
│   │   └── src/
│   │       ├── modules/       # one folder per marketing module (email, social, seo, ...)
│   │       ├── components/
│   │       └── lib/
│   │
│   └── admin-panel/           # internal staff React app
│       └── src/
│           ├── tenants/
│           ├── billing/
│           └── support/
│
├── docker-compose.yml
└── plan.md
```

## 5. Core domain model (shared across modules)

- **Organization (Tenant)** — top-level account, owns everything below.
- **User** — belongs to one or more organizations, has a role.
- **Contact / Audience Member** — a lead/customer; shared by Email, SMS,
  CRM, Push, Segmentation.
- **Segment** — saved filter over Contacts, reused by every channel.
- **Campaign** — generic container (`type`: email/social/sms/ads/...) with
  channel-specific payload tables.
- **Asset** — media/creative files used across modules.
- **Workflow** — automation definition (trigger + steps), can reference any
  campaign type as a step.
- **Integration** — stored OAuth/API credentials per tenant per provider
  (Google Ads, Meta, Twilio, SendGrid, etc.).
- **Event** (analytics) — normalized engagement events (sent, opened,
  clicked, converted) feeding the reporting module.

Designing Contact, Segment, Campaign, and Event as shared primitives from
day one avoids rebuilding audience/reporting logic per channel later.

## 6. Phased roadmap

**Phase 0 — Foundation (infra & platform, no marketing features yet)**
- Repo scaffolding (backend, main-app, admin-panel, docker-compose)
- Auth (signup/login, JWT, RBAC), Organization model, multi-tenancy
- Stripe subscription billing skeleton
- Admin panel: tenant list, impersonation, basic support tools

**Phase 1 — MVP marketing core**
- Audience/Contact + Segmentation
- Email Marketing (campaigns, templates, send via SendGrid/Mailgun, opens/clicks tracking)
- Basic Analytics dashboard (per-campaign stats)

**Phase 2 — Expand channels**
- Social Media scheduling + publishing (start with 1–2 platforms)
- SMS/WhatsApp Marketing (via Twilio)
- Landing Page & Form Builder (feeds Contacts directly)

**Phase 3 — Automation & CRM**
- Marketing Automation / Workflows engine
- CRM & Lead Management (pipeline, lead scoring)
- Cross-channel reporting/attribution

**Phase 4 — Paid & organic growth tools**
- Paid Ads / PPC integration (Google Ads, Meta Ads)
- SEO Marketing (rank tracking, audits)
- Content Marketing calendar

**Phase 5 — Advanced/niche modules**
- Affiliate & Referral Marketing
- Influencer Marketing
- Push Notifications
- Event Marketing

Each phase should ship as a usable increment — i.e., Phase 1 alone is a
sellable "email marketing SaaS" before later phases turn it into a full
suite.

## 7. Key third-party integrations (by module)

- Email: SendGrid / Mailgun / Amazon SES
- SMS/WhatsApp: local BD gateway (e.g. SSL Wireless, BulkSMSBD) rather than
  Twilio — cheaper per-message for BD numbers and routes through a
  BTRC-recognized aggregator, which Twilio does not.
- Social: Meta Graph API, X API, LinkedIn API, TikTok API
- Ads: Google Ads API, Meta Marketing API
- SEO: a rank-tracking data provider (e.g. DataForSEO) or self-built crawler
- Push: Firebase Cloud Messaging / OneSignal
- Billing: SSLCommerz (cards + bKash/Nagad/Rocket/Upay + internet banking),
  billed in BDT

## 8. Non-functional requirements

- **Multi-tenancy isolation:** every query scoped by `organization_id`;
  enforce at the ORM/service layer, not just in route handlers.
- **Background jobs:** all sends (email/SMS/social/push) go through the
  Celery queue, never inline in the request path.
- **Rate limiting & API quotas:** required once ads/social integrations are
  live (provider-side limits).
- **Audit logging:** who sent what campaign to whom — needed for support and
  compliance (CAN-SPAM/GDPR opt-outs).
- **Observability:** structured logging + error tracking (e.g. Sentry) from
  Phase 0, since background job failures are otherwise invisible.
- **BD regulatory compliance:** BTRC approval/masking ID required to send
  bulk SMS/WhatsApp commercially; NBR VAT registration required to issue
  VAT-compliant subscription invoices. Both need a registered Trade License
  + TIN for the business entity — start this paperwork early since it has
  multi-week lead time and gates going live on billing (Step 3) and
  SMS/WhatsApp (Step 10) in `prompt.md`, even though sandbox/test versions
  of both can be built without it.
- **Localization:** BDT as default currency, Bangla (bn) + English UI.

## 9. Open decisions to revisit before Phase 1 coding starts

- Which two social platforms to support first.
- Shared-DB-with-tenant_id vs. schema-per-tenant for multi-tenancy.
- Build vs. buy for the landing-page builder (custom drag-and-drop is a big
  effort sink).
- Which local SMS/WhatsApp aggregator to commit to (SSL Wireless vs.
  BulkSMSBD vs. REVE Systems) — affects WhatsApp Business API access since
  that requires going through an approved BSP.
