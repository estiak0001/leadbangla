"""Provision an internal staff/superadmin user.

Internal accounts are never created through public signup (see Step 2 in
prompt.md) — this is the seed/admin tool that does it instead. Run inside
the backend container:

    docker compose exec backend python -m app.scripts.create_internal_user \\
        --email admin@leadbangla.com --password <password> --role superadmin
"""
import argparse
import asyncio

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models.enums import InternalRole
from app.models.user import User


async def create_internal_user(email: str, password: str, role: InternalRole) -> None:
    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == email))
        if existing is not None:
            existing.internal_role = role
            existing.hashed_password = hash_password(password)
            await db.commit()
            print(f"Updated existing user {email} to internal_role={role.value}")
            return

        user = User(email=email, hashed_password=hash_password(password), internal_role=role)
        db.add(user)
        await db.commit()
        print(f"Created internal user {email} with role={role.value}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--role", choices=[r.value for r in InternalRole], default=InternalRole.STAFF.value)
    args = parser.parse_args()

    asyncio.run(create_internal_user(args.email, args.password, InternalRole(args.role)))


if __name__ == "__main__":
    main()
