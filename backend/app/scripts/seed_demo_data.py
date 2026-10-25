"""Seed realistic demo data for UI walkthroughs.

Creates the internal admin login plus a few demo tenants that are already
subscribed *and* onboarded (skipping the manual signup -> subscribe ->
onboard click-through), each with sample contacts and segments so
Contacts/Segments aren't empty on first login. Idempotent — safe to re-run,
skips any demo tenant that's already been seeded.

    docker compose exec backend python -m app.scripts.seed_demo_data
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models.billing import Plan, Subscription
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.enums import (
    CampaignStatus,
    EventType,
    InternalRole,
    OrgLanguage,
    SocialPlatform,
    SocialPostStatus,
    SubscriptionStatus,
    TenantRole,
)
from app.models.event import Event
from app.models.organization import Organization, OrganizationMember
from app.models.segment import Segment
from app.models.landing_page import LandingPage
from app.models.social import SocialAccount, SocialPost
from app.models.user import User
from app.models.wallet import OrgWallet
from app.models.workflow import Workflow
from app.models.enums import WorkflowTriggerType
from app.services.audience_service import seed_default_tag_presets
from app.services.wallet_service import deduct, topup

ADMIN_EMAIL = "admin@leadbangla.com"
ADMIN_PASSWORD = "adminpass123"

DEMO_PASSWORD = "demopass123"

DEMO_TENANTS = [
    {
        "email": "demo1@leadbangla.com",
        "org_name": "Dhaka Apparel Co.",
        "language": OrgLanguage.EN,
        "plan_code": "starter",
    },
    {
        "email": "demo2@leadbangla.com",
        "org_name": "Chittagong Grocers",
        "language": OrgLanguage.BN,
        "plan_code": "growth",
    },
    {
        "email": "demo3@leadbangla.com",
        "org_name": "Sylhet EdTech",
        "language": OrgLanguage.EN,
        "plan_code": "pro",
    },
]

# Starting wallet balance + one sample deduction per demo tenant, so
# Transaction History isn't empty on first login. Keyed by email (not by a
# plan-code variable) since that's the stable identifier DEMO_TENANTS already
# uses — demo1 is the Starter-plan org, demo2 is Growth.
WALLET_SEEDS = [
    {
        "email": "demo1@leadbangla.com",
        "balance_bdt": 150,
        "deduction": {"cost_paisa": 300, "service": "sms", "units": 3, "reference_id": "seed-sms-campaign"},
    },
    {
        "email": "demo2@leadbangla.com",
        "balance_bdt": 500,
        "deduction": {"cost_paisa": 800, "service": "email_overage", "units": 1000, "reference_id": "seed-email-campaign"},
    },
]

SAMPLE_CONTACTS = [
    {"email": "rahim.uddin@example.com", "phone": "+8801710000101", "first_name": "Rahim", "last_name": "Uddin", "tags": ["vip", "newsletter"], "sms_opt_in": True, "whatsapp_opt_in": True},
    {"email": "karim.hossain@example.com", "phone": "+8801710000102", "first_name": "Karim", "last_name": "Hossain", "tags": ["newsletter"], "sms_opt_in": True, "whatsapp_opt_in": False},
    {"email": "fatema.begum@example.com", "phone": "+8801710000103", "first_name": "Fatema", "last_name": "Begum", "tags": ["vip"], "sms_opt_in": True, "whatsapp_opt_in": True},
    {"email": "nasrin.akter@example.com", "phone": "+8801710000104", "first_name": "Nasrin", "last_name": "Akter", "tags": ["lead"], "sms_opt_in": False, "whatsapp_opt_in": False},
    {"email": "shakil.ahmed@example.com", "phone": "+8801710000105", "first_name": "Shakil", "last_name": "Ahmed", "tags": ["lead", "newsletter"], "sms_opt_in": True, "whatsapp_opt_in": False},
    {"email": "jannatul.ferdous@example.com", "phone": "+8801710000106", "first_name": "Jannatul", "last_name": "Ferdous", "tags": ["customer"], "sms_opt_in": False, "whatsapp_opt_in": True},
    {"email": "tanvir.islam@example.com", "phone": "+8801710000107", "first_name": "Tanvir", "last_name": "Islam", "tags": ["customer", "vip"], "sms_opt_in": True, "whatsapp_opt_in": True},
    {"email": "moushumi.rahman@example.com", "phone": "+8801710000108", "first_name": "Moushumi", "last_name": "Rahman", "tags": ["trial"], "sms_opt_in": False, "whatsapp_opt_in": False},
    {"email": "abul.kashem@example.com", "phone": "+8801710000109", "first_name": "Abul", "last_name": "Kashem", "tags": ["trial"], "sms_opt_in": True, "whatsapp_opt_in": False},
    {"email": "rima.sultana@example.com", "phone": "+8801710000110", "first_name": "Rima", "last_name": "Sultana", "tags": ["newsletter", "customer"], "sms_opt_in": True, "whatsapp_opt_in": True},
]


async def ensure_admin(db: AsyncSession) -> None:
    existing = await db.scalar(select(User).where(User.email == ADMIN_EMAIL))
    if existing is not None:
        print(f"Admin already exists: {ADMIN_EMAIL} (password unchanged)")
        return
    db.add(
        User(
            email=ADMIN_EMAIL,
            hashed_password=hash_password(ADMIN_PASSWORD),
            internal_role=InternalRole.SUPERADMIN,
        )
    )
    await db.commit()
    print(f"Created admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


async def seed_tenant(db: AsyncSession, spec: dict) -> None:
    email = spec["email"]
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, hashed_password=hash_password(DEMO_PASSWORD))
        db.add(user)
        await db.flush()

    existing_membership = await db.scalar(
        select(OrganizationMember).where(OrganizationMember.user_id == user.id)
    )
    if existing_membership is not None:
        print(f"Already seeded: {email} / {DEMO_PASSWORD} (org already exists)")
        return

    plan = await db.scalar(select(Plan).where(Plan.code == spec["plan_code"]))
    if plan is None:
        raise RuntimeError(f"Plan '{spec['plan_code']}' not found — run alembic migrations first")

    organization = Organization(name=spec["org_name"], language=spec["language"])
    db.add(organization)
    await db.flush()

    db.add(OrganizationMember(organization_id=organization.id, user_id=user.id, role=TenantRole.OWNER))
    db.add(
        Subscription(
            user_id=user.id,
            plan_id=plan.id,
            organization_id=organization.id,
            status=SubscriptionStatus.ACTIVE,
            tran_id=f"seed-{uuid.uuid4().hex}",
        )
    )

    contacts = [Contact(organization_id=organization.id, **contact) for contact in SAMPLE_CONTACTS]
    db.add_all(contacts)
    await seed_default_tag_presets(db, organization.id)

    vip_segment = Segment(
        organization_id=organization.id,
        name="VIP customers",
        rules=[{"field": "tag", "operator": "contains", "value": "vip"}],
    )
    newsletter_segment = Segment(
        organization_id=organization.id,
        name="Newsletter subscribers",
        rules=[{"field": "tag", "operator": "contains", "value": "newsletter"}],
    )
    db.add(vip_segment)
    db.add(newsletter_segment)
    await db.flush()

    # A sent campaign with simulated engagement, plus an untouched draft —
    # so Campaigns isn't empty, and both the "sent" and "draft" states are
    # visible on first login.
    sent_campaign = Campaign(
        organization_id=organization.id,
        segment_id=vip_segment.id,
        name="Welcome, VIPs",
        status=CampaignStatus.SENT,
        subject="A little something for our best customers",
        html_body="<p>Thanks for being one of our VIP customers!</p>",
        sent_at=datetime.now(timezone.utc),
    )
    db.add(sent_campaign)
    await db.flush()

    vip_contacts = [c for c in contacts if "vip" in c.tags]
    for contact in vip_contacts:
        db.add(
            Event(
                organization_id=organization.id,
                campaign_id=sent_campaign.id,
                contact_id=contact.id,
                type=EventType.SENT,
                extra={"message_id": f"seed-{uuid.uuid4().hex}"},
            )
        )
        db.add(
            Event(
                organization_id=organization.id,
                campaign_id=sent_campaign.id,
                contact_id=contact.id,
                type=EventType.OPENED,
            )
        )
    if vip_contacts:
        db.add(
            Event(
                organization_id=organization.id,
                campaign_id=sent_campaign.id,
                contact_id=vip_contacts[0].id,
                type=EventType.CLICKED,
            )
        )

    db.add(
        Campaign(
            organization_id=organization.id,
            segment_id=newsletter_segment.id,
            name="Monthly newsletter draft",
            status=CampaignStatus.DRAFT,
            subject="What's new this month",
            html_body="<p>Draft — not sent yet.</p>",
        )
    )

    # ── Social accounts ───────────────────────────────────────────────────────
    fb_account = SocialAccount(
        organization_id=organization.id,
        platform=SocialPlatform.FACEBOOK,
        account_name=f"{spec['org_name']} — Facebook Page",
        page_id="sandbox-page-id",
        access_token="",
    )
    li_account = SocialAccount(
        organization_id=organization.id,
        platform=SocialPlatform.LINKEDIN,
        account_name=f"{spec['org_name']} — LinkedIn",
        page_id="sandbox-org-urn",
        access_token="",
    )
    db.add(fb_account)
    db.add(li_account)
    await db.flush()

    # One already-published FB post with engagement stats.
    db.add(
        SocialPost(
            organization_id=organization.id,
            social_account_id=fb_account.id,
            platform=SocialPlatform.FACEBOOK,
            content="🎉 Big news — check out what we've been working on! #LeadBangla",
            status=SocialPostStatus.PUBLISHED,
            published_at=datetime.now(timezone.utc),
            external_post_id=f"fake-fb-{uuid.uuid4().hex}",
            likes_count=47,
            shares_count=8,
            comments_count=14,
        )
    )
    # One published LinkedIn post.
    db.add(
        SocialPost(
            organization_id=organization.id,
            social_account_id=li_account.id,
            platform=SocialPlatform.LINKEDIN,
            content="Excited to share our latest marketing update with our network. #Marketing #Bangladesh",
            status=SocialPostStatus.PUBLISHED,
            published_at=datetime.now(timezone.utc),
            external_post_id=f"fake-li-{uuid.uuid4().hex}",
            likes_count=23,
            shares_count=4,
            comments_count=6,
        )
    )
    # One scheduled post for tomorrow (would be published by Celery at that time).
    tomorrow = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    tomorrow = tomorrow + timedelta(days=1)
    db.add(
        SocialPost(
            organization_id=organization.id,
            social_account_id=fb_account.id,
            platform=SocialPlatform.FACEBOOK,
            content="📣 Stay tuned for our upcoming announcement! Follow us for more updates.",
            status=SocialPostStatus.SCHEDULED,
            scheduled_at=tomorrow,
        )
    )

    # ── Landing pages ─────────────────────────────────────────────────────────
    import re

    def _slug(title: str) -> str:
        base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        return f"{base[:60]}-{uuid.uuid4().hex[:6]}"

    org_slug = re.sub(r"[^a-z0-9]+", "-", spec["org_name"].lower()).strip("-")

    published_page = LandingPage(
        organization_id=organization.id,
        slug=_slug(f"{org_slug}-newsletter"),
        title=f"Subscribe to {spec['org_name']} Newsletter",
        is_published=True,
        published_at=datetime.now(timezone.utc),
        blocks=[
            {
                "type": "hero",
                "heading": f"Stay Updated with {spec['org_name']}",
                "subheading": "Join thousands of subscribers and get our best offers delivered to your inbox.",
            },
            {
                "type": "text",
                "content": "We send weekly updates with exclusive deals, product news, and industry insights. Unsubscribe at any time.",
            },
            {
                "type": "form",
                "fields": [
                    {"name": "first_name", "label": "First Name", "field_type": "text", "required": False},
                    {"name": "email", "label": "Email Address", "field_type": "email", "required": True},
                    {"name": "phone", "label": "Phone Number", "field_type": "tel", "required": False},
                ],
                "submit_label": "Subscribe Now",
                "success_message": "You're in! Check your inbox for a confirmation email.",
                "auto_tags": ["newsletter"],
            },
        ],
    )
    draft_page = LandingPage(
        organization_id=organization.id,
        slug=_slug(f"{org_slug}-vip-access"),
        title=f"VIP Early Access — {spec['org_name']}",
        is_published=False,
        blocks=[
            {
                "type": "hero",
                "heading": "Get VIP Early Access",
                "subheading": "Be the first to know about our exclusive products and offers.",
            },
            {
                "type": "form",
                "fields": [
                    {"name": "first_name", "label": "First Name", "field_type": "text", "required": True},
                    {"name": "last_name", "label": "Last Name", "field_type": "text", "required": False},
                    {"name": "email", "label": "Email Address", "field_type": "email", "required": True},
                ],
                "submit_label": "Request VIP Access",
                "success_message": "Welcome to our VIP list! We'll be in touch soon.",
                "auto_tags": ["vip", "lead"],
            },
        ],
    )
    db.add(published_page)
    db.add(draft_page)

    # ── Workflows ─────────────────────────────────────────────────────────────
    # 2-step welcome journey: email immediately, then SMS after a 2-minute delay.
    # delay_minutes:2 so it's observable in a live demo without a long wait.
    welcome_workflow = Workflow(
        organization_id=organization.id,
        name="New Contact Welcome",
        trigger_type=WorkflowTriggerType.CONTACT_CREATED,
        trigger_config={},
        is_active=True,
        steps=[
            {
                "type": "send_email",
                "subject": f"Welcome to {spec['org_name']}!",
                "html_body": (
                    f"<p>Hi {{{{first_name}}}},</p>"
                    f"<p>Thanks for joining <strong>{spec['org_name']}</strong>. "
                    f"We're excited to have you!</p>"
                    f"<p>Stay tuned for exclusive updates.</p>"
                    f"<p>— The {spec['org_name']} Team</p>"
                ),
            },
            {
                "type": "wait",
                "delay_hours": 0,
                "delay_minutes": 2,
                "delay_seconds": 0,
            },
            {
                "type": "send_sms",
                "message": (
                    f"Hi {{{{first_name}}}}, this is {spec['org_name']}! "
                    "You've been added to our exclusive list. Reply STOP to unsubscribe."
                ),
            },
            {
                "type": "add_tag",
                "tag": "welcomed",
            },
        ],
    )
    db.add(welcome_workflow)

    await db.commit()
    print(
        f"Seeded tenant: {email} / {DEMO_PASSWORD} — org '{spec['org_name']}' "
        f"({len(SAMPLE_CONTACTS)} contacts, 2 segments, 1 sent + 1 draft campaign, "
        f"2 social accounts, 3 social posts, 2 landing pages, 1 workflow)"
    )


async def seed_wallet(db: AsyncSession, spec: dict) -> None:
    """Idempotent: skips any tenant whose wallet already exists (checked, not
    just topped up again) so re-running the script never double-credits."""
    user = await db.scalar(select(User).where(User.email == spec["email"]))
    if user is None:
        return
    membership = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == user.id))
    if membership is None:
        return
    org_id = membership.organization_id

    existing_wallet = await db.scalar(select(OrgWallet).where(OrgWallet.organization_id == org_id))
    if existing_wallet is not None:
        print(f"Wallet already seeded for {spec['email']} (balance {existing_wallet.balance_paisa / 100:.2f} BDT)")
        return

    await topup(db, org_id, spec["balance_bdt"] * 100, tran_id=f"SEED-{org_id.hex[:8]}")
    await deduct(db, org_id, **spec["deduction"])
    await db.commit()
    print(f"Seeded wallet for {spec['email']}: {spec['balance_bdt']} BDT (with sample transaction history)")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await ensure_admin(db)
        for spec in DEMO_TENANTS:
            await seed_tenant(db, spec)
        for spec in WALLET_SEEDS:
            await seed_wallet(db, spec)


if __name__ == "__main__":
    asyncio.run(main())
