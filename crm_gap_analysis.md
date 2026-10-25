# LeadBangla CRM — Gap Analysis for the Bangladesh Market

Written 2026-10-19. "Today" describes what the app does now (checked in the code). Market notes come from
public web pages (listed at the end) and are marked as vendor claims where they are. Priorities, effort sizes
(S ≈ days, M ≈ 1–2 weeks, L ≈ a month+) and the "why it matters in BD" reasoning are **my judgement**, not
market research — please validate them with 5–10 customer interviews before committing.

## 1. What the CRM is today

A **lead-stage board** on top of the contact list:

- Contacts (email, phone, first/last name, tags, SMS and WhatsApp opt-in), CSV import/export, Trash with restore, change history.
- Kanban board: add/delete stages, drag or "Move to", one stage per contact, search, hot/warm/cold filter.
- Lead score (profile completeness + email opens/clicks + SMS sent + form submissions + completed workflows).
- Contact page: activity timeline (email, SMS, notes, forms), notes, segments, tags.
- Landing-page forms create contacts; workflows can start on contact created / tag added / form submitted.

It is a good **marketing-side** CRM. It is not yet a **sales** CRM.

## 2. Context: how Bangladeshi small businesses sell

- Most digital selling happens on Facebook pages, Messenger and WhatsApp, then a courier is booked; the flow is largely manual.
  Pathao says its merchants (about 200,000, over 80% of digital commerce) "still run their businesses from Facebook pages, Messenger threads, and WhatsApp chats" *(vendor article)*.
- Reported pain points: missed messages, wrong delivery details, delayed COD reconciliation, no profit visibility *(vendor page)*.
- Payments are split between cash on delivery and mobile wallets (bKash, Nagad) *(vendor page)*.
- Common CRM options named in public lists: Odoo (through local partners), Zoho CRM, HelloLeads (markets WhatsApp/SMS/email) *(weak, partly vendor sources)*. I found **no source confirming** that any of them has a Bangla interface or bKash support — a possible opening, but unverified.

## 3. Gap matrix

Priority: **P0** blocks "proper CRM" claims · **P1** expected by serious users · **P2** differentiator / later.

### A. Lead capture & sources
| Capability | Today | Gap | Pri | Effort |
|---|---|---|---|---|
| New contact starts in a pipeline stage | Lands in "Unassigned" | No auto-assign to first stage; new companies have no default stages | P0 | S |
| Lead **source** (Facebook, WhatsApp, referral, walk-in, website, expo) | Only free-text tags | No source field, no source reports | P0 | S |
| Duplicate detection | CSV import only | Manual add/forms can create duplicates | P0 | S |
| WhatsApp / Messenger / Instagram chats become leads | SMS replies are listed; no WhatsApp inbound | No inbound chat capture, no click-to-WhatsApp links | P0/P1 | M–L |
| Facebook Lead Ads import | — | Missing | P1 | M |

### B. Pipeline mechanics
| Capability | Today | Gap | Pri | Effort |
|---|---|---|---|---|
| Default stages | None | Seed New → Contacted → Interested → Negotiation → Customer / Lost | P0 | S |
| Rename, reorder, recolour stages | Add and delete only | Missing | P0 | S |
| Won / Lost meaning | Stages are just names | No outcome flag, no lost-reason | P0 | S |
| Stage history in timeline | Not recorded | No who/when | P0 | S |
| Automation on stage | Workflows cannot set or react to stages | Add "Move to stage" step and "Enters stage" trigger | P0 | M |
| Deal value, expected close date | — | Missing, so no pipeline value | P1 | M |
| Multiple pipelines | One | e.g. retail vs wholesale | P2 | M |
| Board performance | Loads every contact | Needs per-column paging | P1 | M |

### C. Contact data model
Only name, email, phone, tags today. BD sellers also need: **shop/company name, address, district, delivery notes, Facebook profile link, a separate WhatsApp number, customer type (retail / wholesale), last-contacted date, lifetime value**, and **custom fields**. (P0 for company/city/source, P1 for custom fields.) Effort M.

### D. Sales activity & follow-up
| Capability | Today | Gap | Pri | Effort |
|---|---|---|---|---|
| Follow-up tasks with due date ("call back Thursday") | Notes only | **No tasks or reminders** — the main daily CRM habit | P0 | M |
| Call / visit / meeting log | — | Phone is the main channel for many SMEs | P1 | S–M |
| Overdue and "today" list | — | Missing | P0 | S |
| Reminder to the owner (SMS / WhatsApp / email / push) | — | Reuse existing channels | P1 | S |
| Click-to-call and WhatsApp (`wa.me`) buttons | mailto / tel only | Add WhatsApp | P0 | S |

### E. Team & permissions
Roles are owner / admin / member with no lead ownership. Missing: **assign a lead to a person**, "my leads" view, round-robin assignment, a restricted sales role, per-person activity. (P1, M.)

### F. Conversations
Replies are not shown as a conversation on the contact page. A unified thread (SMS, WhatsApp, email) per contact is the core of f-commerce CRM. (P1, L; depends on WhatsApp provider inbound support.)

### G. Bangladesh commerce specifics
| Capability | Today | Gap | Pri | Effort |
|---|---|---|---|---|
| Orders, COD status | — | Missing | P2 | L |
| Courier booking and tracking (Pathao, Steadfast, RedX) | — | Missing; APIs exist and several tools integrate them *(vendor pages)* | P2 | L |
| Dues (credit sales) tracking | — | Common in retail and wholesale | P1 | M |
| bKash / Nagad payment links, payment status per lead | Wallet top-ups only | Missing for customers' own sales | P2 | M–L |
| Invoice / quotation with VAT | — | Missing | P2 | M |

Recommendation: **integrate rather than build** commerce (webhooks or import from the customer's store/courier) until customers ask.

### H. Localisation
Landing page and templates are Bangla; the **app itself is English**. Missing: Bangla UI, Bangla numerals and BDT formatting across screens, Bangla date formats. (P1, M–L.) Bangla names and Bangladeshi phone formats already work in import.

### I. Reporting
Missing: funnel conversion by stage, win rate, average time in stage, leads by source, revenue by source, activity per person, follow-up compliance. (P1, M.)

### J. Compliance & trust
Opt-in flags exist. Missing: **consent log** (when, where, how, who), a clear unsubscribe/opt-out path for SMS, data export/delete on request, an audit trail of role changes. (P1, M.)

### K. Quality & accuracy
- Lead score counts every open/click event, so repeated opens inflate it (score 136 seen). Use unique events and cap per type. (P1, S.)
- No installable mobile app/PWA; the mobile layout was improved but offline and push are absent. (P2.)

## 4. Suggested roadmap

**Phase 1 — "Behaves like a CRM" (about 2–3 weeks, all P0):**
default stages + auto-assign new contacts; edit/reorder/colour stages; Won/Lost outcome; stage history in timeline; lead source, company and city fields; duplicate warning; follow-up tasks with an overdue/today list; WhatsApp click-to-chat; "Move to stage" workflow step + "enters stage" trigger.

**Phase 2 — "Works for a team" (3–4 weeks):**
lead owner and "my leads"; sales role; deal value and close date; funnel and source reports; call log; reminders via SMS/WhatsApp; board paging; consent log; fix lead-score inflation; custom fields.

**Phase 3 — "Built for Bangladesh" (1–2 months):**
Bangla interface; WhatsApp inbound and unified conversation; Facebook Lead Ads; dues tracking; then courier/order/bKash integrations if customers ask.

## 5. Things to verify before building
- Whether your WhatsApp provider supports **inbound messages and webhooks** (needed for D/F).
- Meta **App Review** requirements for Messenger/Instagram/Lead Ads, and how long approval takes.
- Courier API terms and fees (Pathao, Steadfast, RedX).
- Customer interviews: do target customers want deals and values, or only follow-ups and reminders?
- Whether any competing CRM really offers a Bangla UI or bKash (I could not confirm either).

## Sources (public pages, mostly vendor-authored)
- [Pathao Commerce / f-commerce workflow — Future Startup](https://futurestartup.com/?p=49007)
- [FBecha — pain points of social sellers](https://www.turbostarter.dev/ideas/ecommerce/fbecha)
- [COD and WhatsApp in Bangladesh — eGrow](https://www.egrow.com/en/blog/bangladesh-cod-whatsapp-2026)
- [SmartParcel BD — Pathao/Steadfast integration](https://apps.shopify.com/smartparcel-bd)
- [Courier packages for Pathao, Steadfast, RedX, eCourier, Paperfly](https://packagist.org/packages/eshanxbn/laravel-courier-hub-bd)
- [HelloLeads — CRM for Bangladesh](https://www.helloleads.io/blog/?p=14492)
- [Top CRM software in Bangladesh, 2025 perspective](https://write.as/tarek/top-crm-software-in-bangladesh-a-2025-perspective)
- [CRM usage in Bangladesh — wmtips](https://www.wmtips.com/technologies/crm/country/bd)

## 7. Implementation status (2026-10-19)

**Built:** default stages + auto-assign of every new contact (manual, CSV import, landing forms); rename / recolour / reorder stages with Won / Lost
meaning and lost reasons; stage history in the timeline; lead source, shop, city, address, WhatsApp number, Facebook link, retail/wholesale, last-contacted
fields; duplicate warning on manual add; follow-up tasks (today / overdue / upcoming, snooze, email reminder every 15 min); call / visit / meeting log;
WhatsApp click-to-chat; "Enters stage" trigger and "Move to stage" step in workflows; lead owner, "My leads", round-robin, restricted Sales role;
deal value + expected close, pipeline value tiles, per-column paging; funnel / source / lost-reason / team-activity / follow-up reports; custom fields;
consent log (manual, import, form); dues (credit) ledger with WhatsApp reminder; lead-score fix (unique campaigns, capped); SMS replies in the timeline;
installable web app manifest.

**Not built (needs an external account, API or a product decision):** Bangla app interface, WhatsApp / Messenger / Instagram inbound chat and a unified
conversation, Facebook Lead Ads import, orders / COD and courier booking (Pathao, Steadfast, RedX), bKash / Nagad payment links, invoices / quotations
with VAT, multiple pipelines, SMS / WhatsApp reminders to staff (email only for now), offline mode and push for the installable app.
