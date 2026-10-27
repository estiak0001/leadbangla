from pydantic_settings import BaseSettings, SettingsConfigDict

SSLCOMMERZ_PLACEHOLDER_STORE_ID = "leadbangla-sandbox-placeholder"
META_PLACEHOLDER_TOKEN = "leadbangla-meta-placeholder"
LINKEDIN_PLACEHOLDER_TOKEN = "leadbangla-linkedin-placeholder"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "LeadBangla API"
    # New signups must confirm their email with a code. Turn off (EMAIL_VERIFICATION_REQUIRED=false) while the
    # email provider cannot yet send to arbitrary addresses, otherwise nobody new can finish signing up.
    email_verification_required: bool = True
    environment: str = "local"

    database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/marketing_manager"
    redis_url: str = "redis://redis:6379/0"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"

    # Fernet key encrypting platform_services.credentials_enc. Generate with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Empty in dev — cred_crypto.py derives a key from jwt_secret instead
    # (fine for local/demo, NOT safe for production).
    service_cred_key: str = ""

    # Where the frontend (success/cancel pages) and the proxied API are
    # reachable from a browser. Defaults match the docker-compose Nginx setup.
    app_base_url: str = "http://localhost"
    backend_public_url: str = "http://localhost/api"

    # Real SSLCommerz sandbox credentials, once registered at
    # https://developer.sslcommerz.com/registration/ — until then the store
    # id stays at its placeholder value and billing uses a local fake
    # checkout page instead (see app/integrations/sslcommerz.py).
    sslcommerz_store_id: str = SSLCOMMERZ_PLACEHOLDER_STORE_ID
    sslcommerz_store_password: str = "placeholder"
    sslcommerz_sandbox_base_url: str = "https://sandbox.sslcommerz.com"

    @property
    def sslcommerz_is_fake(self) -> bool:
        return self.sslcommerz_store_id == SSLCOMMERZ_PLACEHOLDER_STORE_ID

    # From address used for platform emails when no sender is chosen.
    default_from_email: str = "no-reply@leadbangla.com"

    # ── Email delivery provider ──────────────────────────────────────────────
    # Normally Amazon SES is configured in the admin panel (Integration Hub) and
    # this stays "auto". Env overrides, mainly for development:
    # ses   -> Amazon SES from AWS_* env vars
    # smtp  -> any SMTP server (e.g. MailHog); DKIM-signed per customer domain
    email_provider: str = "auto"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = False
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    ses_configuration_set: str = ""
    # Dev only: treat every DNS check as passed so the flow can be tested
    # against MailHog without owning a real domain.
    email_skip_dns_verify: bool = False
    # Shared secret the provider must send on /public/email/events?secret=...
    email_webhook_secret: str = "leadbangla-email-webhook-placeholder"
    # Value customers put in their SPF record: v=spf1 include:<this> ~all
    email_spf_include: str = "_spf.leadbangla.com"
    email_dkim_selector: str = "lb1"
    # Abuse protection — shared sending reputation.
    email_daily_cap_per_org: int = 2000
    email_max_bounce_rate: float = 0.05
    email_max_complaint_rate: float = 0.003
    email_health_min_sample: int = 50

    # WhatsApp safety: customers sending from the shared platform number share one Meta quality rating,
    # so each is capped per day. Alerts about a broken/low-quality connection go here (empty = log only).
    whatsapp_daily_cap_per_org: int = 1000
    platform_alert_email: str = ""

    # Shared inbox (Amazon SES receiving): how long mail is kept, and abuse limits.
    mail_retention_days: int = 90
    mail_daily_send_cap_per_org: int = 200
    mail_max_attachment_mb: int = 10

    # SSL Wireless SMS/WhatsApp gateway (BTRC-recognized, BD local).
    # Register at https://sms.sslwireless.com — requires Trade License + TIN
    # for live commercial BTRC Masking/Non-masking ID (start paperwork in
    # parallel; sandbox works without it).
    sslwireless_api_token: str = "leadbangla-sslwireless-placeholder"
    # Platform's own shared non-masking Sender ID — already covered under the
    # platform's BTRC registration, so it works for any org with zero
    # per-org approval. Used whenever an org's own requested Sender ID
    # hasn't been marked approved (see Organization.sms_sender_id_approved).
    # This is a deploy-time constant, not part of the admin-editable
    # connection credentials (those are just the api_token above).
    sslwireless_sender_id: str = "LeadBangla"
    # Shared secret SSL Wireless must send back on the inbound (MO/reply) SMS
    # webhook, e.g. as ?secret=... — cheap protection since that endpoint has
    # to be public/unauthenticated for the aggregator to call it.
    sslwireless_webhook_secret: str = "leadbangla-webhook-placeholder"

    @property
    def sslwireless_is_fake(self) -> bool:
        return self.sslwireless_api_token == "leadbangla-sslwireless-placeholder"

    # Meta Graph API (Facebook/Instagram) token. Set a real Page access token
    # once the Meta app is live; until then the integration uses fake publishes.
    meta_access_token: str = META_PLACEHOLDER_TOKEN

    @property
    def meta_is_fake(self) -> bool:
        return self.meta_access_token == META_PLACEHOLDER_TOKEN

    # LinkedIn Marketing API token. Requires Marketing Developer Platform
    # approval (free, apply early — see Step 9 notes in prompt.md).
    linkedin_access_token: str = LINKEDIN_PLACEHOLDER_TOKEN

    @property
    def linkedin_is_fake(self) -> bool:
        return self.linkedin_access_token == LINKEDIN_PLACEHOLDER_TOKEN


settings = Settings()
