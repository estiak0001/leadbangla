# Third-Party Service Budget

Estimates for an early-stage build, assuming a small but real usage volume:
~500 active end-customer accounts, ~50k marketing emails/month, ~5k
SMS/WhatsApp messages/month, light social/ads API usage, light SEO lookups.
Built for the **Bangladesh market** — billing and SMS/WhatsApp use local
providers (Stripe doesn't support BD merchant payouts; Twilio works but is
pricier and not BTRC-registered for local bulk SMS). All numbers are USD
unless noted BDT, approximate, and **exclude the ad spend itself** (Google
Ads / Meta Ads budget is the *customer's* money flowing through the
platform, not a cost to you). Prices change — re-check before committing.

## 1. Per-module third-party costs

| Module | Provider | Free tier | Paid starting point | Notes |
|---|---|---|---|---|
| Email Marketing | SendGrid | 100 emails/day forever | $19.95/mo (50k emails) | Mailgun comparable (~$35/mo/50k). Amazon SES cheapest at scale (~$0.10/1k emails) but more setup work. |
| SMS Marketing | Local BD gateway (SSL Wireless / BulkSMSBD) | Sandbox/test credentials, no card needed | ~0.20–0.50 BDT/SMS (≈$0.002–0.005) domestic | Cheaper per-message than Twilio, but going live requires a BTRC-approved Masking/Non-masking ID and a registered Trade License + TIN — a paperwork gate, not a dev cost. |
| WhatsApp Marketing | Same local aggregator, acting as Meta-approved BSP | none | ~$0.01–0.10 per conversation (Meta's per-conversation pricing, passed through by the BSP) | Direct Meta WhatsApp Business API access in BD still requires going through an approved Business Solution Provider — using the same SMS aggregator avoids a second vendor relationship. |
| Social Media (Meta/IG) | Meta Graph API | Free | Free | Requires Business + App Review; no per-call fee. |
| Social Media (X/Twitter) | X API v2 | None (free tier too limited for posting at scale) | Basic tier **$200/mo** | Pro tier $5,000/mo if you need higher volume/read access. This is the single biggest line item if X is in scope. |
| Social Media (LinkedIn) | LinkedIn Marketing API | Free | Free | Requires Marketing Developer Platform partner approval — no fee, but approval can gate launch timing. |
| Social Media (TikTok) | TikTok for Business API | Free | Free | Requires app review/approval. |
| Paid Ads (Google) | Google Ads API | Free | Free | Needs a developer token (free) + Google Ads manager account. |
| Paid Ads (Meta) | Meta Marketing API | Free | Free | Same account as Graph API above. |
| SEO Tracking | DataForSEO (pay-as-you-go) | — | ~$50–300/mo at light/moderate volume | Priced per request type (SERP, backlinks, on-page). Ahrefs/SEMrush APIs are an alternative but run $500+/mo. |
| Push Notifications | Firebase Cloud Messaging | Free, unlimited | Free | No cost for push delivery itself. |
| Push Notifications (mgmt layer) | OneSignal | Free up to 10k subscribers | From ~$9–99/mo as audience grows | Optional — only needed if you want OneSignal's segmentation UI instead of building on raw FCM. |
| Billing | SSLCommerz (cards + bKash/Nagad/Rocket/Upay + internet banking) | Sandbox API, no card needed | ~2.5–3.5% + VAT per transaction depending on payment method | No fixed monthly fee, but going live needs a registered Trade License + TIN to onboard as a merchant — same paperwork gate as SMS above. |

**Subtotal, no-X-API scenario:** roughly **$40–250/mo** depending on SEO
volume, once Email + SMS/WhatsApp + Push + SSLCommerz are live — lower than
a Twilio/Stripe baseline mainly because local SMS is cheaper per-message.

**If X (Twitter) support is included:** add a flat **$200/mo minimum**,
which dominates the rest of the budget at this stage.

**One-time BD setup gate (applies to both Billing and SMS/WhatsApp):** a
registered Trade License + TIN, plus BTRC SMS Masking/Non-masking
registration, are prerequisites for going live on real money/real messages.
Sandbox/test versions of both can be built and demoed without them — see
`prompt.md` Steps 3 and 10 — but start this paperwork early since it has
multi-week lead time, same as the LinkedIn/TikTok app-review gates below.

## 2. Platform/infra costs (not marketing APIs, but required to run them)

| Item | Provider example | Estimated cost |
|---|---|---|
| App hosting (backend + 2 React apps) | Render / Railway / Fly.io | $25–100/mo at MVP scale |
| Managed Postgres | Same provider or AWS RDS | $15–60/mo |
| Managed Redis (queue + cache) | Same provider or AWS ElastiCache | $10–30/mo |
| Background worker (Celery) compute | Same as hosting | included above or +$10–25/mo |
| Object storage for assets | AWS S3 + CloudFront | $5–20/mo at low volume |
| Error tracking | Sentry | Free tier, then $26/mo (Team) |
| Domain name | Any registrar | ~$12–15/year |
| SSL | Let's Encrypt / included with host | $0 |

**Infra subtotal:** roughly **$65–235/mo** at MVP scale.

## 3. One-time / setup costs (not recurring)

| Item | Cost | Notes |
|---|---|---|
| Meta Business verification | Free, but multi-week review | Required for WhatsApp Business API + ad/social APIs at scale. |
| LinkedIn Marketing Developer Platform approval | Free | Approval process, not a fee — budget time, not money. |
| X API Basic tier setup | Included in $200/mo | No separate setup fee currently. |
| Trade License + TIN registration | Government fees, varies | Required before going live on SSLCommerz billing and BTRC-registered SMS. |
| BTRC SMS Masking/Non-masking ID | Government/aggregator fee, varies | Required before live (non-sandbox) bulk SMS/WhatsApp sending. |
| Apple/Google app store accounts (only if mobile app later) | $99/year (Apple), $25 one-time (Google) | Not needed for web-only MVP. |

## 4. Rough monthly total by phase

| Phase | What's live | Estimated 3rd-party + infra cost |
|---|---|---|
| Phase 0 (Foundation) | Auth, billing skeleton (SSLCommerz sandbox), hosting | $65–150/mo |
| Phase 1 (Email MVP) | + SendGrid/SES | $85–175/mo |
| Phase 2 (Social/SMS/Landing pages) | + local SMS gateway, Meta Graph (X optional) | $90–340/mo ($290–540/mo if X included) |
| Phase 3 (Automation/CRM) | mostly internal, minor infra growth | +$20–40/mo |
| Phase 4 (Ads/SEO/Content) | + DataForSEO, Ads APIs (free) | +$50–300/mo |
| Phase 5 (Affiliate/Influencer/Push/Events) | + OneSignal if used | +$10–100/mo |

**Steady-state estimate once most modules are live: ~$310–850/mo**,
**~$510–1,050/mo if X/Twitter is in scope**, before any ad spend
pass-through, before your own infra scales past MVP-level traffic, and
before the one-time Trade License/TIN/BTRC paperwork costs above.

## 5. Key caveats

- All messaging/email/SMS costs are **usage-based** — they scale with how
  much your customers send, not with your own dev work. Plan to pass these
  through (directly or via tiered pricing) rather than absorbing them.
- Ad spend (Google/Meta) is the end customer's budget, routed through your
  platform — not a cost line for you.
- X API pricing has changed multiple times since 2023; re-verify current
  tier pricing before committing, as it's the most volatile line item here.
- SEO data providers price per API call type — actual cost depends heavily
  on how many keyword/backlink checks each customer runs per month.
- SSLCommerz and local SMS aggregator transaction/per-message fees vary by
  payment method and provider — re-verify current rate cards before
  committing, same caveat as X API above.
- The Trade License + TIN + BTRC registration gate is one-time and mostly
  time (not money), but it blocks going live on billing and SMS/WhatsApp
  regardless of dev progress — start it in parallel with Phase 0, not after.
