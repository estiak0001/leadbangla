"""Seed the subscription plans (limits + prices), sized to the AWS/gateway costs in budget.md.

Idempotent: creates any plan whose code is missing and leaves existing plans
alone, so edits made in the admin panel are never overwritten. Pass --reset to
force every seeded plan back to the values below.

    docker compose exec backend python -m app.scripts.seed_plans
    docker compose exec backend python -m app.scripts.seed_plans --reset

Limits: -1 = unlimited. SMS/WhatsApp are prepaid wallet credits, not plan limits.
Email cost at full usage (SES ~$0.10/1k = ~12 BDT/1k) stays well under each price, e.g. Pro
150k emails ~ 1,800 BDT vs 5,999 BDT/month. There is no free tier.
"""
import asyncio
import sys

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.models.billing import Plan

PLANS = [
    {
        "code": "starter", "name": "Starter", "price_bdt": 799,
        "contacts_limit": 2000, "emails_monthly_limit": 8000, "team_members_limit": 2,
        "workflows_limit": 3, "landing_pages_limit": 3, "social_accounts_limit": 2,
        "seo_credits_monthly": 20, "custom_domain": False, "priority_support": False,
        "sms_enabled": True, "sms_monthly_limit": 300, "masking_allowed": False, "whatsapp_enabled": False,
    },
    {
        "code": "growth", "name": "Growth", "price_bdt": 2499,
        "contacts_limit": 15000, "emails_monthly_limit": 40000, "team_members_limit": 5,
        "workflows_limit": 15, "landing_pages_limit": 15, "social_accounts_limit": 8,
        "seo_credits_monthly": 150, "custom_domain": True, "priority_support": False,
        "sms_enabled": True, "sms_monthly_limit": 3000, "masking_allowed": True, "whatsapp_enabled": True, "whatsapp_monthly_limit": 1000,
    },
    {
        "code": "pro", "name": "Pro", "price_bdt": 5999,
        "contacts_limit": 100000, "emails_monthly_limit": 150000, "team_members_limit": 15,
        "workflows_limit": -1, "landing_pages_limit": 50, "social_accounts_limit": 20,
        "seo_credits_monthly": 500, "custom_domain": True, "priority_support": True,
        "sms_enabled": True, "sms_monthly_limit": 15000, "masking_allowed": True, "whatsapp_enabled": True, "whatsapp_monthly_limit": 5000,
    },
]


async def main(reset: bool) -> None:
    async with AsyncSessionLocal() as db:
        for spec in PLANS:
            plan = await db.scalar(select(Plan).where(Plan.code == spec["code"]))
            if plan is None:
                db.add(Plan(billing_interval="monthly", is_active=True, **spec))
                print(f"Created plan {spec['code']}")
            elif reset:
                for key, value in spec.items():
                    setattr(plan, key, value)
                plan.is_active = True
                print(f"Reset plan {spec['code']}")
            else:
                print(f"Plan {spec['code']} exists — left unchanged (use --reset to overwrite)")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main("--reset" in sys.argv))
