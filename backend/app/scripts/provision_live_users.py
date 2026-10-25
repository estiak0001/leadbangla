"""Create the first logins on a LIVE server: one staff superadmin for the admin panel and one
sample customer (company owner) for the main app. No demo data is added.

Run it on the server, inside the backend container, with passwords you choose (12+ characters):

    docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.provision_live_users \\
        --admin-email you@yourcompany.com --admin-password '<strong password>' \\
        --customer-email sample@yourcompany.com --customer-password '<another strong password>' \\
        --org-name "Sample Company" --plan pro

Running it again with the same emails resets those passwords. Never use the public demo passwords here.
"""
import argparse
import asyncio
import re
import sys

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models.billing import Plan, Subscription
from app.models.enums import InternalRole, SubscriptionStatus, TenantRole
from app.models.organization import Organization, OrganizationMember
from app.models.user import User

BANNED = {"demopass123", "adminpass123", "password123", "password"}


def check_password(label: str, pw: str) -> None:
    if len(pw) < 12 or pw.lower() in BANNED or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        sys.exit(f"{label} password must be at least 12 characters with letters and digits, and not a demo password.")


async def run(a: argparse.Namespace) -> None:
    async with AsyncSessionLocal() as db:
        # Staff superadmin (admin panel)
        admin = await db.scalar(select(User).where(User.email == a.admin_email))
        if admin is None:
            db.add(User(email=a.admin_email, hashed_password=hash_password(a.admin_password), internal_role=InternalRole.SUPERADMIN))
            print(f"Created admin panel login: {a.admin_email}")
        else:
            admin.hashed_password, admin.internal_role = hash_password(a.admin_password), InternalRole.SUPERADMIN
            print(f"Updated admin panel login: {a.admin_email}")

        # Sample customer: owner of a company on an active plan
        user = await db.scalar(select(User).where(User.email == a.customer_email))
        if user is None:
            user = User(email=a.customer_email, hashed_password=hash_password(a.customer_password))
            db.add(user)
            await db.flush()
            print(f"Created customer login: {a.customer_email}")
        else:
            user.hashed_password = hash_password(a.customer_password)
            print(f"Updated customer login: {a.customer_email}")
        if await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == user.id)) is None:
            plan = await db.scalar(select(Plan).where(Plan.code == a.plan))
            if plan is None:
                sys.exit(f"Plan '{a.plan}' not found. Run: python -m app.scripts.seed_plans")
            org = Organization(name=a.org_name, language="en")
            db.add(org)
            await db.flush()
            db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=TenantRole.OWNER))
            db.add(Subscription(user_id=user.id, plan_id=plan.id, organization_id=org.id, status=SubscriptionStatus.ACTIVE, tran_id=f"live-{org.id.hex}"))
            print(f"Created company '{a.org_name}' on plan '{a.plan}'")
        await db.commit()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--admin-email", required=True)
    p.add_argument("--admin-password", required=True)
    p.add_argument("--customer-email", required=True)
    p.add_argument("--customer-password", required=True)
    p.add_argument("--org-name", default="Sample Company")
    p.add_argument("--plan", default="pro")
    a = p.parse_args()
    if a.admin_email == a.customer_email:
        sys.exit("Use two different emails.")
    check_password("Admin", a.admin_password)
    check_password("Customer", a.customer_password)
    asyncio.run(run(a))


if __name__ == "__main__":
    main()
