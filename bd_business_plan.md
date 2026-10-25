# LeadBangla — Bangladesh Business Model & Go-To-Market Plan

Builds on `plan2.md` (hybrid wallet model), `budget.md` (costs). Market figures
are from public web sources found 2026-10-18; items marked **(verify)** came
from vendor blogs or unofficial pages and must be checked before you rely on them.

## 1. Market read

| Fact | Implication for LeadBangla |
|---|---|
| Internet users ≈ 77.7M, ~44.5% penetration (DataReportal via DHL, Jan 2025) | Mobile-first audience. Landing pages, forms and emails must be fast on phones. |
| E-commerce ≈ US$6–7.5B in 2025, estimates vary by source (ECDB, Research&Markets, Financial Express) | Real, growing demand, but treat any single figure as rough. |
| Cash-on-delivery still dominates; card e-commerce growing ~24% YoY (Financial Express) | Customers are trust-sensitive. Order-confirmation and delivery-update messages are as valuable as promotions. |
| Most e-commerce vendors are small/medium and don't keep live inventory (Financial Express) | Target is a shop owner or Facebook-page seller, not a marketing team. Product must be simple. |
| bKash "70M users" **(verify)** | Pay-by-bKash is a must-have, not a feature. |
| Mailchimp is on ~56% of BD sites that use an email tool (wmtips, site-count not user survey) **(verify)** | Mailchimp is the incumbent. Its pain points for BD users are USD payment and English-only UI — your wedge. |
| Bulk SMS ≈ ৳0.16–0.40 non-masking, ~৳0.56–0.64 masking, cheaper at high top-ups (Alpha SMS, BulkSMSDhaka) | SMS resale margin is thin at volume. Don't build the business on SMS markup alone. |
| SMS rules reported: promotional only 10:00–17:00, ≥70% Bangla, brand name included, BTRC floor price ৳0.19 **(verify with BTRC/gateway)** | Build these as product guards (send-window scheduler, Bangla/brand check). It becomes a compliance selling point. |

Gap: I found no reliable count of Facebook sellers or SMEs. Get it from the
SME Foundation / BTRC / e-CAB before putting a number on a pitch deck.

## 2. Who to sell to (in order)

1. **F-commerce and online shops** (clothing, food, beauty, gadgets). Highest message frequency, already pay for ads, fastest decisions.
2. **Local retail and grocery chains** (like the "Chittagong Grocers" demo). Repeat-purchase reminders, offers.
3. **Education / coaching centres and clinics.** Admissions and appointment reminders, high SMS use.
4. **Agencies managing several small clients.** Later: needs multi-workspace and white-label.

Skip for now: enterprises and banks. They need procurement, on-prem demands and long sales cycles.

## 3. Business model

Keep the hybrid model in `plan2.md`: subscription plus prepaid credits.

| Stream | How it earns | Watch-out |
|---|---|---|
| Subscription (৳/month) | Starter 1,500 / Growth 4,500 / Enterprise 12,000 (current defaults) | See pricing note below. |
| SMS / WhatsApp credits | Resale at ~৳1.00/SMS vs ~৳0.30–0.50 cost | Margin shrinks if rivals sell at ৳0.3–0.6 non-masking. Compete on convenience and compliance, not on price. |
| Email overage | Per 1,000 emails | High margin, small volume. |
| SEO credits | Per query | Optional; low priority for this audience. |

**Pricing note.** ৳1,500/month is high for a one-person Facebook shop when
Brevo/MailerLite start around US$9–10 (~৳1,100–1,200) and Mailchimp has a free tier.
Suggestions:
- Add a **free tier** (e.g. 200 contacts, 500 emails/month, SMS pay-as-you-go) to remove the trust barrier.
- Add a cheaper **entry plan around ৳500–800**, or make Starter cheaper, and test the price before committing.
- Offer **annual prepay with 2 months free**. It improves cash flow, which matters because gateway and BTRC costs are paid up front.
- Take **bKash/Nagad as the primary checkout**. A card is optional.

## 4. Unit economics (illustrative, change the assumptions)

Assumptions: 500 paying accounts; mix 60% Starter / 30% Growth / 10% Enterprise;
৳120 = US$1; cost figures from `budget.md`.

| Line | Per month |
|---|---|
| Blended subscription revenue per account | ≈ ৳3,450 |
| Subscription revenue, 500 accounts | ≈ ৳17.3 lakh |
| Third-party + infra (budget.md steady state, US$510–1,050) | ≈ ৳0.6–1.3 lakh |
| SSLCommerz fees (~3% of billed amount) | ≈ ৳0.5 lakh |
| Gross margin before salaries and marketing | high (>85%) on subscriptions |

The model is **sensitive to account count, not to cost**. Infra is cheap; the hard
part is acquiring and retaining the first 500 paying accounts. 500 accounts at
this mix is an aggressive target for year one. Plan for 100–150 and see what
churn does.

## 5. Go-to-market phases

**Phase 0 — Compliance and trust (start now, runs in parallel).**
Trade License + TIN, BTRC masking/non-masking ID, SSLCommerz merchant onboarding,
Meta business verification. These have multi-week lead times and block going live.

**Phase 1 — Pilot (first 20–30 customers, ~8 weeks).**
Recruit personally: Facebook seller groups, shop-owner communities, coaching centres.
Offer free onboarding and 1–2 months free in exchange for feedback and a testimonial.
Goal: 10 accounts sending campaigns weekly. Measure activation (first campaign sent
within 7 days), not sign-ups.

**Phase 2 — Repeatable acquisition (months 3–6).**
- Bangla content: short videos and Facebook posts ("ঈদে SMS দিয়ে বিক্রি বাড়ানোর ৫ উপায়"), guides for Eid, Pohela Boishakh, 11.11 and Black Friday.
- **Seasonal campaign templates** ready in Bangla for each of those events.
- Referral and affiliate program (the product already has an affiliate module): ৳ credit for each paying referral.
- Partnerships: courier and e-commerce enablers, web agencies, local accountants.
- Paid acquisition: Facebook/Instagram ads to the Bangla landing page, optimised for cost per activated account.

**Phase 3 — Expand (months 6–12).**
Agency/white-label plan, WhatsApp, simple abandoned-cart or order-update automations,
integrations with common BD stores and couriers, and a basic phone/WhatsApp support line in Bangla.

## 6. What to build next because of this analysis

1. **Send-window and compliance guard** for promotional SMS (10:00–17:00, Bangla share, brand name) once confirmed with the gateway.
2. **Free tier + cheaper entry plan** configured in the admin panel (no code change; plan data).
3. **bKash/Nagad-first checkout** and BDT/Bangla-numeral invoices.
4. **Bangla seasonal templates** (Eid, Boishakh, 11.11, Black Friday).
5. **Order-confirmation and delivery-status message templates**, for the cash-on-delivery trust problem.
6. **Onboarding checklist** that gets a new user to a first sent campaign in under 10 minutes.

## 7. Metrics to track

Activation rate (first campaign within 7 days), free-to-paid conversion, monthly
churn (target <5% for SMB), wallet top-up rate, SMS gross margin per message,
CAC per activated account and payback months, support tickets per 100 accounts.

## 8. Main risks

| Risk | Mitigation |
|---|---|
| SMS price competition and a BTRC price floor | Sell compliance and workflow, not raw SMS; let bundles absorb small margins. |
| SMB churn is high, and low willingness to pay | Free tier, annual prepay, show revenue/ROI in reports. |
| BTRC / SSLCommerz paperwork delays | Start in Phase 0; keep sandbox demo for pilots. |
| Mailchimp / local SMS panels are good enough | Win on Bangla UI, bKash billing, one place for email+SMS+WhatsApp. |
| Unverified market numbers | Re-check every **(verify)** item before external use. |

## Sources

- [DHL — BD e-commerce trends 2025](https://www.dhl.com/discover/en-bd/e-commerce-advice/e-commerce-trends/what-is-e-commerce-2025-blangladeshi-trends)
- [Financial Express — cash to cards shift](https://thefinancialexpress.com.bd/trade/from-cash-to-cards-e-commerce-shift-gathers-pace)
- [Financial Express — e-commerce ecosystem](https://thefinancialexpress.com.bd/views/effortlessly-adapting-to-an-e-commerce-ecosystem-in-bangladesh-1576857281)
- [ECDB — Bangladesh e-commerce](https://ecdb.com/resources/sample-data/market/bd/all)
- [Alpha SMS pricing](https://sms.net.bd/Pricing)
- [wmtips — email marketing in BD](https://www.wmtips.com/technologies/email-marketing/country/bd/)
