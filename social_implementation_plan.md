# Social Media Expansion — Step-by-Step Implementation Plan

Companion to [social_plan.md](social_plan.md) (feasibility and decisions). This document is the **work plan**: ordered steps, the files each one touches, how to test it, and when it is "done".
Status: **plan only — nothing here is built yet.** Items marked **(verify)** depend on Meta/LinkedIn details that must be confirmed against their current docs or a real test Page.

## 0. Ground rules

| Topic | Rule |
|---|---|
| Next migration number | `0064` (latest applied is `0063`). Planned: `0064` history/campaigns, `0065` inbox, `0066` auto-replies, `0067` OAuth. Rebuild the backend image after adding a migration (the `alembic/` folder is not bind-mounted) and run `alembic upgrade head`. |
| Where code lives | Graph calls only in `backend/app/integrations/meta.py` and `linkedin.py`. Business logic in new services `social_import_service.py`, `social_campaign_service.py`, `social_insights_service.py`, `social_comment_service.py`, `social_inbox_service.py`, `social_autoreply_service.py`. Routes in `api/v1/social.py` (posts/accounts) plus a new `api/v1/social_extra.py` (campaigns, insights, inbox, rules) registered with the same `require_permission("growth")` dependency. Public webhook in `api/v1/social_webhook.py`. |
| Background work | Celery tasks in `workers/tasks.py`, schedule in `workers/celery_app.py` (same pattern as `publish_due_social_posts_task`). |
| Errors | Every Graph/LinkedIn failure becomes a `SocialPublishError` with a message a person can act on (extend the `ERRORS` map). Never show raw JSON. Never fake a result. |
| Frontend | Extend `modules/social/` with one file per tab; shared bits in `socialMeta.tsx`; API in `lib/social.ts`. Compact style as in the current Posts/Accounts tabs. |
| Tests per phase | (1) simulated-Graph harness in a rolled-back DB transaction, (2) API calls with `curl`, (3) headless-browser run checking console errors and screenshots, (4) a checklist run against a real test Page. |
| Rollout | Each phase is shippable alone. New plan flags where needed, per-account kill switches, and nothing writes to a customer's network except what the customer asked for. |

## Track A — Owner actions (start on day 1, run in parallel; they gate phases 3–5)

| # | Action | Needed for | Lead time |
|---|---|---|---|
| A1 | Create the platform **Meta app** (Business type) under the company's Business Manager | OAuth, webhooks, review | 1 hour |
| A2 | Start **Meta Business Verification** (trade licence, business documents) | Advanced Access | days–weeks |
| A3 | Publish a **privacy policy** page and a **data-deletion URL** | App Review | 1–2 days |
| A4 | Create a **test Facebook Page** + **Instagram Business account** linked to it, and add 1–2 **tester users** to the app | Testing phases 2–4 without review | 1 hour |
| A5 | Prepare **App Review** submissions: for each permission a short screencast and use-case text. Planned permissions: pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement, pages_messaging, instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_messages **(verify exact list in the dashboard)** | Advanced Access | 1–2 days to prepare; weeks for Meta |
| A6 | LinkedIn: apply for the Community Management API (Development tier, then Standard) | LinkedIn history/comments | days–weeks |

Development of phases 1–2 does **not** wait for any of these.

---

## Phase 0 — Foundations (½–1 day)

**Goal:** a safe base so the later phases are quick and testable.

- **0.1 Graph client structure.** In `meta.py` keep `_req` as the single door; add `paged(path, fields, limit)` that follows `paging.cursors.after`/`paging.next` up to a cap with a pause between pages; add error-code entries (permission, rate limit 4/17/32/613, "outside allowed window", "person not available").
- **0.2 Simulated Graph.** `backend/tests/fakes/graph.py`: a small router mapping `(method, path pattern)` → canned JSON (published_posts, media, comments, conversations, messages, send, errors). Tests patch `meta._req` to use it. Add helpers to build a test org/account.
- **0.3 Test harness.** Reuse the rolled-back-transaction pattern (savepoint session, rollback at end) as a pytest fixture; `pytest` + `pytest-asyncio` are already in `pyproject.toml`.
- **0.4 Plan/permission flags.** Migration `0064` (see 1.1) also adds `plans.social_inbox_enabled` (bool, default false; true for Growth and Pro) and `plans.social_autoreply_enabled`. Admin Plans page gets two checkboxes (same pattern as `whatsapp_enabled`).
- **0.5 Observability.** One logger `social` with structured lines: account id, action, duration, outcome. Counters later feed the admin panel.

**Done when:** a sample test imports a fake page of 3 posts end-to-end against the simulated Graph.

---

## Phase 1 — History, results, campaigns, insights (3–4 days) — no Meta approval needed

### Backend
- **1.1 Migration `0064`.**
  - `social_posts`: `campaign_id` (FK → `social_campaigns`, SET NULL), `permalink`, `source` (`app`|`imported`, default `app`), `stats_synced_at`; unique partial index (`social_account_id`, `external_post_id`).
  - `social_campaigns`: `id, organization_id, name, goal, color, start_date, end_date, archived, created_at`.
  - `social_accounts`: `followers_count, info_synced_at, last_import_at, last_import_message`.
  - plan flags from 0.4.
- **1.2 Graph read functions** (`meta.py`): `list_facebook_posts(page_id, token, limit)` (`published_posts` with message, created_time, permalink_url, full_picture, shares, likes/comments summaries); `list_instagram_media(ig_id, token, limit)` (caption, media_type, media_url/thumbnail, permalink, timestamp, like_count, comments_count); `account_info_facebook/instagram` (followers). Normalise all to one dict shape.
- **1.3 Import service** `social_import_service.import_history(db, org, account_id, limit=100)`: fetch → map to `SocialPost(source="imported", status=published, published_at=created_time)` → insert skipping existing `external_post_id` → update the account's `last_import_*` → return `{imported, skipped, message}`. Photo-only posts get content `""` shown as "(picture only)".
- **1.4 Stats sync** `sync_account(db, account)`: refresh followers and engagement for posts published in the last 30 days (batched, small pauses, per-post errors collected not fatal). Celery task `sync_social_stats_task`, beat every 6 h. Reuse the 6-hourly pattern to also set `last_check_ok` (token health) and alert the owner by email when a token breaks (like the WhatsApp health check).
- **1.5 Campaigns** `social_campaign_service`: create/update/archive/delete (delete = unlink posts, never delete posts); `assign_posts(campaign_id, post_ids)`; `results(campaign_id)` returning totals (posts, likes, comments, shares, engagement), per-network and per-day breakdown, best post, first/last post date.
- **1.6 Insights** `social_insights_service.summary(org, days)`: engagement by weekday and by hour (best time), top 5 posts, 30-day trend, per-network comparison — computed locally from our table.
- **1.7 API** (`social_extra.py`): `POST /social/accounts/{id}/import`, `POST /social/accounts/{id}/sync`, `GET/POST /social/campaigns`, `GET/PUT/DELETE /social/campaigns/{id}`, `POST /social/campaigns/{id}/posts`, `POST /social/posts/{id}/campaign`, `GET /social/insights`, `GET /social/posts/export.csv`. Extend `SocialPostRead`/`SocialAccountRead` with the new fields.

### Frontend
- **1.8 Accounts tab:** per-account buttons **Import history** and **Sync now** with progress and the result message ("Imported 48, 2 already there"); follower count; "last imported" time.
- **1.9 Posts tab:** "Imported" tag, "View on network" link (permalink), campaign chip, filter by campaign, **Add to campaign** (menu), **Repost** (opens the composer prefilled), checkbox selection for bulk add.
- **1.10 Campaigns tab:** card list (name, dates, post count, engagement, mini bar) → detail view (totals tiles, per-network bars, daily trend, its posts, best post); create/edit side panel with colour and dates; archive.
- **1.11 Insights tab:** tiles, weekday × hour heat-map ("best time"), top posts, trend line (CSS/SVG, no new library).
- **1.12 Export:** CSV button on Posts and on a campaign.

### Tests and acceptance
- Simulated-Graph tests: import creates N posts, a second run creates 0 (dedupe), a Graph permission error becomes a clear message, stats sync updates counters, campaign results match hand-calculated totals, deleting a campaign keeps posts.
- Browser run: all tabs render with no console errors; import button shows result; campaign detail charts render with seed data.
- **Real-Page checklist:** connect the test Page with a real token, import history, confirm counts against Facebook, create a campaign, assign posts, compare engagement numbers with Page insights UI.
- **Done when:** a customer can connect a Page, import its history, group posts into a campaign and read the results, and numbers match the network.

---

## Phase 2 — Comments (2 days) — likely no approval for the Page's own admin token **(verify)**

- **2.1 Graph:** `list_comments(post_id, token)` (FB: message, from, created_time, like_count, comment_count; IG: text, username, timestamp, like_count); `reply_comment(comment_id, text)` (FB `POST /{comment}/comments`, IG `POST /{comment}/replies`); optional `hide_comment` (FB). Map permission and "comment deleted" errors.
- **2.2 Service/API:** `GET /social/posts/{id}/comments`, `POST /social/comments/{comment_id}/reply` (body: account_id, text), `GET /social/comments/recent?days=7` (aggregates the last N published posts per account, caps total calls, concurrent with a limit).
- **2.3 UI:** new **Inbox** tab with sub-tab **Comments**: feed grouped by post, reply box, "replied" marker (kept locally so it persists), link to the comment on the network. Comment counts on post rows open this view.
- **2.4 Safety:** reply length limits per network; no reply to the Page's own comments; sending state and error under the box.
- **Tests:** simulated comments (list, reply success, reply error); browser check; real-Page reply on a test post.
- **Done when:** a comment on the test Page appears in the platform and a reply posted there shows on Facebook/Instagram.

---

## Phase 3 — Inbox: Messenger and Instagram DMs (5–7 days) — **Advanced Access for real customers; build and test now with testers**

- **3.1 Migration `0065`:** `social_conversations` (`account_id, network_conversation_id, participant_id, participant_name, snippet, unread_count, status open|closed, assigned_to_user_id, contact_id, bot_paused_until, last_message_at, last_inbound_at`), `social_messages` (`conversation_id, direction in|out, network_message_id unique, text, attachments jsonb, sent_at, sent_by_user_id, auto_reply_rule_id`), `social_webhook_events` (raw payload hash for idempotency, processed flag). Encrypt message text at rest (reuse the Fernet helper).
- **3.2 Webhook** `api/v1/social_webhook.py`: `GET` verification (verify token), `POST` receiver that **checks the `X-Hub-Signature-256` header with the app secret**, stores the raw event, enqueues a Celery task and returns 200 immediately. Idempotent by event/message id.
- **3.3 Page subscription:** when an account connects (and on "Reconnect"), subscribe the Page to the app (`/{page}/subscribed_apps` with fields for messages, message echoes, comments/feed). Show subscription status on the account card.
- **3.4 Ingestion worker:** parse message events → upsert conversation (fetch participant name once via Graph) → insert message → bump unread. Handle echoes (our own sent messages) so replies sent from Meta's own app also appear. Handle read/delivery receipts.
- **3.5 Send:** `POST /social/inbox/conversations/{id}/reply` → Send API; **window check before sending**: if the last inbound message is older than the standard window **(verify current length)** return a clear "window closed" message and offer the Human Agent route only for manual replies **(verify eligibility)**. Store the outgoing message and mark the conversation read.
- **3.6 API:** `GET /social/inbox/conversations?status=&assigned=&account=`, `GET .../{id}/messages`, `POST .../{id}/read`, `POST .../{id}/assign`, `POST .../{id}/close|reopen`, `POST .../{id}/contact` (create/match CRM contact by participant id/name, optional phone).
- **3.7 CRM link:** matching contact is shown beside the thread; "Create contact" prefills name; contact timeline (`/crm/contacts/{id}/timeline`) gains social message events.
- **3.8 UI:** Inbox → **Messages**: left list (avatar tile, name, snippet, time, unread dot, account chip), right thread (bubbles, day separators, reply box, saved replies menu, assign dropdown, close), filters (All / Unassigned / Mine / Unread), polling every few seconds while open (webhook-fed DB, so cheap), browser/sidebar unread badge.
- **3.9 Compliance jobs:** retention job deletes messages older than the configured days (default 90); **data-deletion callback** endpoint required by Meta (deletes a person's stored messages/contact link on request); privacy text in the app.
- **3.10 Plan gate:** `social_inbox_enabled` checked on all inbox routes with the usual upgrade message.
- **Tests:** webhook signature accept/reject; duplicate delivery inserts once; out-of-order events; window-closed error; assignment and unread counts; deletion callback; browser run of the two-pane UI with mocked data; **real tester run**: message the test Page from a tester account, see it appear within seconds, reply from the platform, see it in Messenger.
- **Done when:** a tester's Messenger/Instagram message appears live, can be answered, assigned and linked to a CRM contact, and retention/deletion work.

---

## Phase 4 — Auto-replies (3–4 days v1, +2–3 days v2) — same approval as Phase 3

- **4.1 Migration `0066`:** `social_auto_rules` (`account_id nullable (=all), channel message|comment, name, enabled, trigger first_message|keyword|any|outside_hours, keywords[], match any|all|exact, reply_variants[], public_reply bool, private_reply bool, tags_to_add[], start_workflow_id, cooldown_minutes, priority`), `social_auto_log` (`rule_id, conversation_id/comment_id, action, outcome sent|skipped|failed, reason, created_at`), account settings table or columns for business hours, timezone, away message, hand-off keywords, daily cap, kill switch.
- **4.2 Engine** `social_autoreply_service.evaluate(event)`: ordered checks — account kill switch → bot paused for this conversation → already auto-replied (message/comment id) → per-person cooldown → daily cap → rules by priority (first match wins) → render variant with `{first_name}`, `{page_name}` → decision.
- **4.3 Actions:** message reply via Send API; comment public reply and/or private reply (comment id as recipient, **one per comment, within 7 days**); add CRM tags; start a workflow; set `bot_paused_until` when a person replies or says a hand-off word. Random 5–30 s delay (Celery countdown), never during the window-closed state.
- **4.4 Hook-up:** the ingestion worker (3.4) and a `feed`/comment webhook handler call `evaluate`; every decision writes `social_auto_log`.
- **4.5 API:** CRUD for rules, `POST /social/auto-replies/test` (dry run: input text → which rule → rendered reply, nothing sent), `GET /social/auto-replies/log`, account auto-reply settings.
- **4.6 UI:** Inbox → **Auto-replies**: rule cards with on/off, trigger summary, "triggered N times"; editor drawer with phone preview and variable chips; test box; **Settings** card for hours/timezone/away/greeting/hand-off/daily cap; activity log table with filters; clear banner when the kill switch is on.
- **4.7 v2:** short flows (ask for phone → save to contact → confirm), workflow trigger actions, shared engine hook for WhatsApp inbound messages.
- **Tests:** engine unit tests (priority, cooldown, dedupe, hand-off pause, outside hours using a fixed clock), duplicate webhook produces one reply, comment rule sends public + private once, dry-run endpoint; tester run on the test Page for each rule type.
- **Done when:** on the test Page a greeting, a keyword reply, an away reply, and a comment-to-DM all work once each, each shows in the log, and the kill switch stops them instantly.

---

## Phase 5 — "Connect with Facebook" (3–4 days) — needs the approved platform app

- **5.1 Migration `0067`:** `social_oauth_states` (state, org, user, expires), account fields for token expiry and granted scopes.
- **5.2 Flow:** `GET /social/oauth/facebook/start` → redirect to Facebook Login with the planned scopes → `GET /social/oauth/facebook/callback` validates state, exchanges the code, gets a **long-lived** user token, lists the user's Pages (and linked Instagram accounts) → returns a picker; selected Pages store their **Page tokens** (encrypted) and auto-subscribe webhooks (3.3).
- **5.3 UI:** Accounts tab shows **Connect with Facebook** as the main button; the token-pasting form moves under "Advanced". A "Reconnect" button when a token is revoked or expires; expiry warning from the health job.
- **5.4 Admin:** Integration Hub card for the platform Meta app (app id/secret/verify token) — the existing, currently unused `meta_social` card becomes real.
- **Tests:** state mismatch rejected, expired code, user with no Pages, scope-declined message; real login with a tester.
- **Done when:** a tester connects a Page in three clicks with no token handling.

## Phase 6 — LinkedIn and extras (2–3 days each, optional)

- LinkedIn: history import and comments after vetting (API paths and role checks in `linkedin.py`); no DMs exist.
- Extras by value: saved replies and hashtag sets, drag-and-drop rescheduling, approval step for teams, UTM links per campaign, PDF campaign report, AI-assisted reply drafts (always reviewed or handed off).

---

## Cross-cutting checklist (every phase)

- **Security:** tokens and message bodies encrypted at rest; webhook signature verified; per-org scoping on every query; no token ever returned to the browser; rate limiting on reply and import endpoints.
- **Permissions:** keep the existing "Social, ads & growth" permission; add the plan flags above; log who sent each reply.
- **Observability:** structured logs, admin-panel health page for social tokens and webhook last-received time, email alert when a token breaks or the webhook goes silent for 24 h.
- **Docs/help:** short in-app help for each new screen; token/permission guide updated; privacy policy mentions stored messages and retention.
- **Rollback:** every migration has a downgrade; features sit behind plan flags and kill switches so a problem can be switched off without a deploy.

## Schedule (working days, one developer)

| Days | Work | Milestone / demo |
|---|---|---|
| 1 | Track A kicked off; Phase 0 | Fake-Graph import test passes |
| 2–5 | Phase 1 | **Demo 1:** import history, campaigns with results, insights |
| 6–7 | Phase 2 | **Demo 2:** comments in the platform with replies |
| 8–14 | Phase 3 (against dev-mode testers) | **Demo 3:** live inbox on the test Page |
| 15–18 | Phase 4 v1 | **Demo 4:** auto-replies for messages and comments |
| 19–20 | Phase 4 v2 | Flows and workflows |
| 21–24 | Phase 5 (when the app is approved) | **Demo 5:** Connect with Facebook |
| 25+ | Phase 6 / polish / launch checklist | Public launch for inbox customers |

Total build is about **5 working weeks**; calendar time for inbox/auto-reply/OAuth launch depends on Meta's review (Track A).

## What I need from you before each phase

| Before | Needed |
|---|---|
| Phase 1 | Go-ahead; a connected test Page token (or I use the simulated Graph first) |
| Phase 2 | Test Page + one test post with comments |
| Phase 3 | Meta app created (A1), tester users (A4), the retention period (default 90 days), plan assignment (Growth/Pro?) |
| Phase 4 | Wording for default greeting/away message, whether to show the "automated reply" note |
| Phase 5 | Approved app (A2–A5), production domain with HTTPS for the redirect and webhooks |
