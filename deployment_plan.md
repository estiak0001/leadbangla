# LeadBangla — Deployment Plan

Status: proposal. Prices are approximate list prices from memory (USD/month) — re-check with each provider before buying.

## 1. Recommendation

**Start on one VPS running Docker Compose, in front of Cloudflare, with managed daily backups. Scale out in stages when metrics say so.**

Why this fits the project today:

- The stack is already containerised (FastAPI, Celery worker + beat, Postgres, Redis, two React apps, Nginx). A production compose file is a small step from what exists.
- Load is modest: today the whole stack idles at about 1.5 GB RAM, the database is 13 MB, and email and SMS leave through APIs (SES over HTTPS, Alpha SMS over HTTPS). No outbound port 25 is needed, so any VPS provider works.
- Kubernetes, ECS or serverless would add cost and operations work with no benefit at this size.
- Nothing in the design blocks scaling later. The app is stateless, Celery workers can be added, and Postgres can move to a managed service without code changes.

### Options compared

| Option | Monthly cost at launch | Effort | Verdict |
|---|---|---|---|
| **A. Single VPS + Docker Compose** (Hetzner / DigitalOcean / Vultr / AWS Lightsail) | $15–35 | Low | **Recommended to start** |
| B. AWS native (ECS Fargate + RDS + ElastiCache + ALB) | $120–250 | High | Good at 500+ tenants; too heavy now |
| C. PaaS (Render / Railway / Fly.io) | $40–100 | Low | Easy, but 2–4x the cost of A, and Celery + beat + Postgres add up |
| D. Bangladesh data centre / local hosting | Varies | Medium | Choose only if a legal or latency requirement says so; check network reliability and backup tooling first |

### Where to host

- Pick a **Singapore or Mumbai** region: lowest latency to Bangladesh among the major clouds. Amazon SES stays in `us-east-1`; that is fine because it is an API call.
- If you want fewer vendors, **AWS Lightsail** (Singapore/Mumbai) keeps the server, DNS and SES under one bill. Hetzner/DigitalOcean/Vultr are usually cheaper per vCPU.
- **Open question — data residency:** confirm whether Bangladesh data-protection rules or any customer contract requires customer data to stay in-country. This can change the hosting choice.

## 2. Target architecture (stage 1)

```
Users ──► Cloudflare (DNS, TLS, WAF, rate limit)
              │
              ▼
        VPS: Nginx (80/443 only)
          ├─ app.<domain>      → static build of main-app
          ├─ /api/             → backend (uvicorn/gunicorn workers)
          └─ admin.<domain>    → static build of admin-panel   (IP-allowlisted)
        backend ──► Postgres 16 (volume) ──► daily backups off-server
        backend ──► Redis 7 (AOF on)
        worker  (Celery, concurrency 2–4)      beat (exactly one instance)
              │
              ▼
   Amazon SES (email) · Alpha SMS · SSLCommerz · Meta/LinkedIn APIs
```

Domains: `app.<domain>` (customers, also serves `/api` and the open/click tracking URLs), `admin.<domain>` (staff only).

## 3. Server and cloud specs by stage

| Stage | When | App server | Database | Est. cost |
|---|---|---|---|---|
| **1. Launch** | up to ~50 paying tenants, under ~100k emails/month | 1 VPS, **2 vCPU / 4 GB RAM / 60 GB SSD** (e.g. Hetzner CPX21-class, DO 4 GB, Lightsail 4 GB) + provider snapshots/backups | Postgres on the same VPS | $12–25 server + $3–6 backups |
| **2. Growth** | ~50–500 tenants, up to ~1M emails/month | App VPS **4 vCPU / 8 GB**; optionally a second VPS for Celery workers | **Managed Postgres** 2 vCPU / 4 GB / 50 GB with PITR; Redis stays on the app host or small managed instance | $90–170 total |
| **3. Scale** | 500+ tenants or availability targets | 2–3 app nodes behind a load balancer, separate worker nodes | Managed Postgres HA + read replica for analytics; managed Redis | $250–600 |

Sizing notes from what runs today:

- Backend about 140 MB, Postgres about 70 MB, Redis about 5 MB. The **Celery worker used about 890 MB** because it defaults to one process per CPU core; capping `--concurrency` at 2–4 cuts that sharply.
- Keep **disk at 60 GB or more**. SMS sender-ID documents are stored inside Postgres (`bytea`), so database and backup size grow with uploads.
- Add 20–30 percent headroom for the OS, Nginx and spikes. 4 GB RAM is the practical minimum for stage 1.

### Monthly running cost at launch (rough)

| Item | Cost |
|---|---|
| VPS (stage 1) + backups | $15–30 |
| Domain | about $1 |
| Cloudflare free plan | $0 |
| Amazon SES | about $0.10 per 1,000 emails (100k emails = $10) |
| SMS via Alpha SMS | pass-through; priced per message, billed through the customer wallet |
| Monitoring (UptimeRobot free, Sentry free tier) | $0 |
| **Baseline total** | **about $25–45, plus usage** |

## 4. Required changes before go-live

These are specific to the current repository and must be done before any public launch.

**Build and runtime**
1. **Frontends run Vite dev servers** (`npm run dev` in both Dockerfiles). Replace with multi-stage builds: `npm run build`, serve `dist/` with Nginx.
2. **Backend runs `uvicorn --reload`** with the source folder bind-mounted. Remove both; run multiple workers (gunicorn with the uvicorn worker class, or `uvicorn --workers 2–4`). Bake the code and Alembic migrations into the image.
3. Create a separate **`docker-compose.prod.yml`**: no bind mounts, no MailHog, `restart: unless-stopped`, health checks, resource limits, Celery `--concurrency 2–4`.
4. **Run migrations as a deploy step** (`alembic upgrade head`) before starting new containers.
5. Initialise **git** (the project is not a repository yet) so builds can be tagged and rolled back.

**Secrets and configuration**
6. Replace defaults: `JWT_SECRET` (currently `change-me`), a real Fernet key for `SERVICE_CRED_KEY` (otherwise it is derived from the JWT secret), database password (currently `postgres`), `EMAIL_WEBHOOK_SECRET`.
7. Set `ENVIRONMENT=production`, `APP_BASE_URL`, `BACKEND_PUBLIC_URL` to the real HTTPS URLs. Open/click tracking and the SES SNS webhook depend on `BACKEND_PUBLIC_URL` being publicly reachable.
8. Keep secrets in a root-owned `.env` file outside the repository, or the provider's secret manager.
9. **Reset demo data:** remove demo users, change `admin@leadbangla.com`, and create a real staff account with `create_internal_user`.

**Network and security**
10. Publish only ports **80 and 443**. The current compose also exposes Postgres (55432), Redis (6379), the API (8090), both dev servers (5173/5174) and MailHog (8025) — remove all of them.
11. Firewall (ufw): SSH from your IP only, key-based login, no password SSH, fail2ban, unattended security upgrades.
12. HTTPS everywhere via Cloudflare + origin certificate or Let's Encrypt; HSTS on.
13. **Restrict `admin.<domain>`** to office/VPN IPs (Cloudflare Access or an Nginx allowlist) and add login rate limiting on both apps.

**Reliability**
14. **Redis persistence** (AOF) — it is the Celery broker; also confirm tasks are idempotent (campaign sending is guarded by status checks).
15. **Exactly one `beat` instance** — never scale it.
16. **Backups:** nightly `pg_dump` (or managed PITR) copied to off-server storage (S3 or Backblaze B2), 14–30 day retention, and a **restore drill** before launch.
17. Disk, CPU and RAM alerts; uptime checks on `/docs` health and the login page; error tracking (Sentry).

**Integrations that depend on the server**
18. **Amazon SES:** production access approved; SNS topic subscribed to `https://app.<domain>/api/v1/public/email/events?secret=…`; set the Public API URL and Webhook Secret in the Integration Hub.
19. **SSLCommerz:** register the public success/fail/IPN callback URLs.
20. **Alpha SMS:** confirm whether it requires IP whitelisting; if so, give it the server's static IP.
21. Add an **unsubscribe link and page** before sending real marketing mail (AWS reviewers and compliance both expect it).

## 5. CI/CD

1. Push to `main` → GitHub Actions builds `backend`, `main-app`, `admin-panel` images and pushes tagged images to GHCR.
2. Deploy job: SSH to the server → `docker compose pull` → `alembic upgrade head` → `docker compose up -d`.
3. Rollback: redeploy the previous image tag. Migrations should be backward-compatible for one release so a rollback is safe.
4. A `staging` environment (same compose on a $6 VPS) is recommended before the first production deploy.

## 6. Rollout phases

| Phase | Work | Duration |
|---|---|---|
| 0. Prepare | Production Dockerfiles and compose, secrets, git, CI | 2–4 days |
| 1. Staging | Deploy to a small VPS, run migrations, exercise email/SMS/payment flows in sandbox, restore a backup | 2–3 days |
| 2. Go-live | Production VPS, DNS cut-over, SES production access and SNS webhook, SSLCommerz live callbacks, monitoring on | 1–2 days |
| 3. Soft launch | A few pilot customers; watch bounce/complaint rates, queue lag, DB size | 2–4 weeks |

### When to move to the next stage

- CPU above 60 percent sustained, or RAM above 75 percent.
- Celery queue delay above a few minutes during campaign sends.
- Database above 20–30 GB or slow queries from analytics.
- A downtime target you cannot meet with one server.

## 7. Decisions needed from you

1. Hosting provider and region (Singapore/Mumbai suggested), and whether data must stay in Bangladesh.
2. Monthly infrastructure budget (the stage-1 baseline is about $25–45).
3. Production domain name for the app and admin panel.
4. Who receives uptime/backup alerts, and who has server access.
5. Target launch date (decides whether the production hardening in section 4 fits).
