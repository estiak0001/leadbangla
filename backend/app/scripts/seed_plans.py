"""Seed the subscription plans (limits + prices), sized to budget.md / plan2.md.

Idempotent: creates any plan whose code is missing and leaves existing plans
alone, so edits made in the admin panel are never overwritten. Pass --reset to
force every seeded plan back to the values below.

    docker compose exec backend python -m app.scripts.seed_plans
    docker compose exec backend python -m app.scripts.seed_plans --reset

Limits: -1 = unlimited. SMS/WhatsApp are prepaid wallet credits, not plan limits.
Email cost at full usage (SES ~$0.10/1k) stays well under each price, e.g. Pro
300k emails ~ 3,600 BDT vs 9,500 BDT/month.
"""
import asyncio
import sys

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.models.billing import Plan

PLANS = [
    {
        "code": "starter", "name": "Starter", "price_bdt": 1500,
        "contacts_limit": 3000, "emails_monthly_limit": 10000, "team_members_limit": 2,
        "workflows_limit": 3, "landing_pages_limit": 3, "social_accounts_limit": 2,
        "seo_credits_monthly": 50, "custom_domain": False, "priority_support": False,
        "sms_enabled": True, "sms_monthly_limit": 300, "masking_allowed": False, "whatsapp_enabled": False,
    },
    {
        "code": "growth", "name": "Growth", "price_bdt": 4500,
        "contacts_limit": 25000, "emails_monthly_limit": 75000, "team_members_limit": 5,
        "workflows_limit": 20, "landing_pages_limit": 20, "social_accounts_limit": 10,
        "seo_credits_monthly": 300, "custom_domain": True, "priority_support": False,
        "sms_enabled": True, "sms_monthly_limit": 3000, "masking_allowed": True, "whatsapp_enabled": True, "whatsapp_monthly_limit": 2000,
    },
    {
        "code": "pro", "name": "Pro", "price_bdt": 9500,
        "contacts_limit": -1, "emails_monthly_limit": 300000, "team_members_limit": -1,
        "workflows_limit": -1, "landing_pages_limit": -1, "social_accounts_limit": -1,
        "seo_credits_monthly": 1000, "custom_domain": True, "priority_support": True,
        "sms_enabled": True, "sms_monthly_limit": 15000, "masking_allowed": True, "whatsapp_enabled": True, "whatsapp_monthly_limit": 10000,
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
