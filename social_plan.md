# Social Media — Expansion Plan (history, results, campaigns, inbox)

Status: **plan only — nothing from this document is built yet.** (A first migration/model edit was started and fully reverted; the app is unchanged.)
Facts about Meta/LinkedIn come from their documentation and third-party summaries found on 2026-10-25. Items marked **(verify)** could not be confirmed and must be checked against the official docs or a real test Page before building.

## 1. What you asked for

1. **Connect messages** — see and answer customers' messages/comments from inside the platform.
2. **Load existing posts** — import what is already on the Page, see its history.
3. **Campaigns** — a list of social campaigns with results.
4. **Other useful features** this platform can offer on top (it already has contacts, CRM, email, SMS, WhatsApp, workflows).

Today the Social module can only **publish** (Facebook, Instagram, LinkedIn), keeps its own post list, and shows likes/comments/shares fetched on demand.

## 2. Feasibility check (the important part)

### 2.1 Two ways to connect — and why it decides everything

| | A. Customer pastes their own token (today) | B. One platform Meta app + "Connect with Facebook" button |
|---|---|---|
| Who owns the Meta app | each customer | LeadBangla |
| Meta App Review needed | **No** (each customer is an admin of their own app/Page = "Standard Access") | **Yes** — Business Verification + App Review for each permission ("Advanced Access") |
| Friction for a small business | **High** (create an app, generate long-lived tokens, find IDs) | Low (log in with Facebook, tick the Page) |
| Posting + importing history + post results | Works | Works |
| **Inbox (Messenger / Instagram DMs)** | **Only shows people who have a role on the app/Page** — i.e. almost useless for real customers | Works for all customers' messages |
| Token expiry | Customer must re-create tokens | Platform handles long-lived Page tokens |

Meta's documentation states that reading conversations with people who do **not** have a role on your app or Page requires **Advanced Access**, which requires App Review; the same split applies to webhooks (real-time notifications). So **the inbox cannot work properly with approach A**. Everything else can.

### 2.2 Feature by feature

| Feature | Source API | Permissions needed | With approach A (no review) | Verdict |
|---|---|---|---|---|
| Import Page post history (Facebook) | `/{page}/published_posts` | pages_read_engagement, pages_show_list | Works | **Build now** |
| Import Instagram posts | `/{ig}/media` | instagram_basic (Facebook Login) | Works | **Build now** |
| Likes / comments / shares per post | post fields | as above | Works | **Build now** |
| Page followers count | `/{page}?fields=followers_count` | pages_read_engagement | Works | **Build now** |
| Reach / impressions per post | Insights | read_insights | Unstable: Meta **deprecated** `impressions` and many unique-reach metrics (changes Nov 2025 and **15 Jun 2026**), replaced by new "views / media views" metrics | **Skip in v1**; add "views" later after testing on a real Page |
| Comments: list + reply (Facebook) | `/{post}/comments`, `POST /{comment}/comments` | pages_read_engagement, pages_manage_engagement | Probably works for the Page's own admin token **(verify)** | Build in phase 2 |
| Comments: list + reply (Instagram) | `/{media}/comments`, `/{comment}/replies` | instagram_manage_comments | Same **(verify)** | Build in phase 2 |
| Messenger inbox | Conversations API, `POST /{page}/messages` | pages_messaging, pages_manage_metadata, pages_read_engagement; Page token from a user with the MESSAGING task | **Role-holders only** | **Needs Advanced Access (approach B)** |
| Instagram DMs | Instagram messaging API | instagram_manage_messages (Facebook Login) or instagram_business_manage_messages (Instagram Login) | Role-holders only | **Needs Advanced Access** |
| Reply window rules | — | — | — | Standard replies are limited to a window after the person's last message (commonly 24 h); Meta documents a "human agent" option up to 7 days **(verify exact current rules)** |
| LinkedIn: read Page posts + comments | Community Management API, `socialActions` | r_organization_social / w_organization_social, user must be a Page ADMINISTRATOR | Needs the app to be **vetted** by LinkedIn (Development tier, then Standard after a screencast review) | Later; one-time approval |
| LinkedIn direct messages | none public | — | — | **Not possible** |
| X (Twitter), TikTok | — | — | Paid API / app review | Out of scope (as today) |

## 3. Recommended approach — "hybrid"

1. **Build now, no approval needed:** history import, results, campaigns, insights, comments. These work with the current paste-your-token connection.
2. **Start Meta Business Verification + App Review immediately, in parallel** — it takes the longest and gates the inbox and the easy "Connect with Facebook" button. Your registered business (trade licence) is the main requirement, plus a privacy-policy URL, a data-deletion URL/callback, and screencasts of each permission in use **(verify exact list in the App Review dashboard)**.
3. **Build the inbox against Meta's development mode** (testers and test Pages work without review), so it is ready the day Advanced Access arrives.
4. Add the **"Connect with Facebook"** flow once the platform app is approved; it replaces the token-pasting form.

## 4. Design

### 4.1 Data model (new migration)
- `social_posts` + `campaign_id`, `permalink`, `source` (`app` | `imported`), `stats_synced_at`; a unique index on (`social_account_id`, `external_post_id`) so importing twice never duplicates.
- `social_campaigns` — `name`, `goal`, `color`, `start_date`, `end_date`, `archived`.
- `social_accounts` + `followers_count`, `info_synced_at`, `last_import_at`, `last_import_message`.
- Phase 3 (inbox, webhook-driven): `social_conversations` (account, network conversation id, participant id/name, last message, unread count, assigned_to, status), `social_messages` (direction, text, attachments, sent_at, network message id), optional link `contact_id` to the CRM contact.

### 4.2 Backend
- **Importer:** page through published posts (cap ~200 per run), normalise to our post shape, skip duplicates, save permalink and engagement. Same for Instagram media. Failures give plain messages (expired token, missing permission, wrong ID).
- **Stats sync job (Celery beat, every 6 h):** refresh engagement for posts published in the last 30 days; refresh follower counts.
- **Campaigns service:** CRUD; assign / unassign posts (single or bulk); results = posts, likes, comments, shares, engagement rate, best post, per-network and per-day breakdown. Archive instead of delete; deleting a campaign never deletes posts.
- **Comments service:** list comments for a post, reply, and an aggregated "recent comments" feed (last N published posts per account).
- **Inbox service (phase 3):** webhook endpoint (signature-checked with the app secret) → store conversations/messages; send reply through the Send API; enforce the reply window before sending and explain when it is closed.
- **Insights (computed locally from our own history, no extra API):** engagement by weekday/hour ("best time to post"), top posts, 30-day trend, per-network comparison.

### 4.3 UI (on the existing Social page, same tab pattern)
`Posts · Campaigns · Inbox · Insights · Accounts`
- **Posts:** imported posts marked "Imported" with a "View on network" link; filter by campaign; "Add to campaign"; duplicate / repost.
- **Accounts:** per-account **Import history**, **Sync now**, follower count, last import result.
- **Campaigns:** card list (name, dates, posts, engagement) → detail page with totals, charts and its posts; create/edit in a side panel.
- **Inbox:** two panes — conversation list and thread with a reply box; sub-tabs **Messages** and **Comments**; unread badges; "create CRM contact" and "assign to teammate" actions.
- **Insights:** tiles, weekday/hour heat-map, top posts, trend.

### 4.4 Platform synergies (what makes this better than a stand-alone tool)
- Message/comment sender → **create or match a CRM contact**, tag it, drop it into a pipeline stage.
- Social campaign results beside **email / SMS / WhatsApp campaign results** in Analytics.
- **Workflows:** trigger "new comment containing keyword" / "new message" → tag contact, send SMS, notify a teammate.
- **Team:** assign conversations, per-role permission (reuse the existing "Social, ads & growth" permission).

### 4.5 Other useful features, ranked
1. Best-time-to-post suggestions (from your own history) — cheap, high value.
2. Saved replies and hashtag sets.
3. Repost / duplicate a past post.
4. Campaign report export (CSV; PDF later).
5. UTM-tagged links per campaign, so website visits can be attributed.
6. Post approval step for teams.
7. Drag-and-drop rescheduling on the calendar.

## 5. Phases, effort, dependencies

| Phase | Scope | Needs Meta approval? | Effort |
|---|---|---|---|
| 1 | History import (FB + IG), follower counts, stats sync job, campaigns (list, detail, results), Insights tab, repost, CSV export | No | 3–4 days |
| 2 | Comments: list, reply, aggregated feed | Likely no **(verify)** | 2 days |
| 3 | Inbox: webhooks, conversations/messages storage, reply with window rules, CRM link, assignment | **Yes — Advanced Access** (dev-mode testing possible before) | 5–7 days |
| 4 | "Connect with Facebook" (platform app, Page picker, long-lived tokens, auto-reconnect) | **Yes** | 3–4 days |
| 5 | LinkedIn history/comments (after LinkedIn vetting); views metrics; X/TikTok if ever funded | LinkedIn vetting | 2–3 days each |

Calendar time is dominated by **Meta Business Verification and App Review (typically weeks)** — start that now.

## 6. Risks and how they are handled

- **Meta changes metrics/permissions often** (already happened twice for Insights): keep reach/impressions out of v1; isolate every Graph call in one module; show friendly errors.
- **Privacy:** storing customer messages makes LeadBangla a data processor — needs a privacy policy section, Meta's data-deletion callback, retention rules (for example delete messages after N days), and encryption of message bodies at rest.
- **Rate limits:** import and sync run in the background with small page sizes and back-off.
- **Reply window:** the send button must be disabled with a clear explanation when the window is closed.
- **Token expiry:** the existing 6-hourly health check can be extended to social accounts, with an email alert like WhatsApp has.
- **Testing without real tokens:** a simulated Graph API for automated tests, plus a real Meta test app, a test Page and tester users for manual runs.

## 7. Decisions and actions needed from you

1. **Approve the hybrid approach** (section 3), or choose A only (no inbox) or B only (wait for approval before building anything).
2. **Start Meta Business Verification** (trade licence, business documents) and prepare a **privacy-policy URL** and a **data-deletion URL**.
3. Confirm the **priority order** of phases 1–5.
4. Decide whether the inbox / comments are a **plan feature** (for example Growth and Pro only) or available to all plans.
5. Provide a **test Facebook Page and Instagram Business account** (and a tester account) so the new features can be checked against the real APIs, not only a simulation.
6. Message retention: how long to keep stored messages (suggested: 90 days, configurable).

## 8. Auto-reply to messages and comments (builds on the Inbox, phase 3)

**How it works.** Meta sends the platform a webhook when a message or comment arrives → the platform checks the page's rules → it sends the reply through the Messenger / Instagram / Graph API → everything is logged. It therefore needs the same webhook and Advanced Access setup as the inbox.

**Messages (Messenger, Instagram DMs)**
- First-contact greeting (once per person per 24 h), away message outside business hours, keyword rules ("price", "location", "hours"), and a fallback ("we'll reply soon").
- Stays inside Meta's standard reply window after the person's last message; promotional content is allowed inside that window.
- **Human hand-off:** the bot pauses for N hours when a teammate replies or the person types "agent"; bot disclosure text is available ("automated reply").

**Comments (Facebook, Instagram)**
- Keyword or "any comment" rules, with two actions that can be combined: a **public reply** under the comment, and a **private reply** (a direct message to the commenter).
- Meta allows **one private reply per comment, within 7 days**; any follow-up is allowed only after the person answers (then within the normal window). The comment ID arrives in the Page `feed` webhook.
- Ignore the Page's own comments and replies to replies; one auto-reply per comment ID.

**Safeguards (built in from day one)**
- Idempotency: the same webhook delivered twice never produces two replies; never answer our own "echo" messages.
- Per-person cooldown, per-account daily cap, random 5–30 s delay and several reply variants per rule (looks natural, avoids spam detection).
- **Kill switch** per account, a **test mode** that shows what would be sent without sending, and an **activity log** (who, which rule, what was sent).

**Platform advantages over Meta's built-in tools**
- Match the sender to a **CRM contact** (create one if new), add tags, move a pipeline stage.
- A rule can **start a workflow** (send an SMS/WhatsApp/email follow-up, notify a teammate, create a task).
- Simple **lead-capture flows**: reply asks for a phone number, the answer is saved on the contact.
- The same rule engine can later serve **WhatsApp** inbound messages (the webhook already exists and today only handles STOP) and SMS replies.

**Data and screens**
- Tables: `social_auto_rules` (channel, trigger, conditions, replies, actions, on/off), `social_auto_log`, and per-conversation `bot_paused_until`.
- UI: Inbox → **Auto-replies** tab: rule list with trigger counts and on/off, rule editor with a phone-style preview, a test box, business hours and timezone, default greeting/away message, hand-off keyword.

**Meta rules to respect (from Meta's policy page)** — reply inside the 24-hour window; non-promotional message tags and the 7-day Human Agent tag are for manual or non-promotional use, not for sending promotions; disclose automation where the law requires it. A reported newer 7-day window for chats started from click-to-message ads **(verify)**.

**Effort and order**
1. v1 (3–4 days after the inbox webhooks exist): greeting / away / keyword replies for messages; keyword public + private replies for comments; CRM tagging; log, cooldowns, kill switch.
2. v2 (2–3 days): workflow triggers and short lead-capture flows.
3. v3 (optional): AI-written replies from the business's own FAQ, always with hand-off to a person and a review mode first.

**Until Meta approval arrives** customers can switch on Meta's own free automations in Meta Business Suite (instant reply, away message, comment-to-message) — I believe these exist there **(verify)**; our rules then add the CRM and workflow links on top.

## Sources
- [Messenger private replies (Meta)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/discovery/private-replies)
- [Instagram private replies (Meta)](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies)
- [Messenger Platform and IG Messaging API policy (Meta)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy)

- [Conversations API for Messenger Platform (Meta)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations)
- [Meta Webhooks for Messenger Platform](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks)
- [Messenger Platform Changelog](https://developers.secure.facebook.com/documentation/business-messaging/messenger-platform/changelog)
- [What Is Meta Advanced Access (third party)](https://singhamandeep.com/what-is-meta-advanced-access/)
- [Page Insights API Updates (Meta, 2025)](https://developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates/)
- [Page/insights reference (Meta)](https://developers.facebook.com/docs/graph-api/reference/insights/)
- [Introducing Graph API v25.0 (Meta)](https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/)
- [Meta deprecates additional Page Insights metrics (PPC Land)](https://ppc.land/meta-deprecates-additional-page-insights-api-metrics-from-november-15/)
- [App Review for Instagram API (Meta)](https://developers.facebook.com/docs/instagram-platform/app-review)
- [Instagram API permission scopes explained (third party)](https://www.getphyllo.com/post/instagram-api-permissions-scopes)
- [LinkedIn Community Management API migration guide (Microsoft Learn)](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide)
- [LinkedIn network update social actions (Microsoft Learn)](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions?view=li-lms-2025-04)
