"""Seed a few customers with manual payments (pending / approved / rejected) so the staff review flow can be tried.

Also fills the manual payment accounts with clearly-marked TEST values if none are set yet.
Safe to run again: existing test users are left alone.

    docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.seed_payment_test_data --password '<12+ chars>'
"""
import argparse
import asyncio
import struct
import sys
import zlib
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.cred_crypto import encrypt_creds
from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models.billing import Plan, Subscription
from app.models.enums import SubscriptionStatus
from app.models.manual_payment import ManualPayment, ManualPaymentDocument
from app.models.platform_service import PlatformService
from app.models.user import User
from app.services.payment_options import manual_accounts

TEST_ACCOUNTS = {
    "bkash": "TEST 01700-000000 (Personal) - use Send Money",
    "nagad": "TEST 01800-000000 (Personal) - use Send Money",
    "rocket": "TEST 018000000001 (Personal)",
    "bank": "TEST Bank Ltd - A/C name: LeadBangla - A/C no: 0000000000 - Branch: Dhaka",
    "note": "Use your registered email as the payment reference. We verify payments within a few working hours.",
}

# (email, company, plan, method, trx, status, admin note)
CASES = [
    ("manualtest1@example.com", "Pending bKash Shop", "starter", "bkash", "TEST9A1B2C3D", "pending", None),
    ("manualtest2@example.com", "Pending Nagad Traders", "growth", "nagad", "TEST7E8F9G0H", "pending", None),
    ("manualtest3@example.com", "Approved Rocket Co", "pro", "rocket", "TEST5J6K7L8M", "approved", "Payment received."),
    ("manualtest4@example.com", "Rejected Bank Ltd", "starter", "bank", "TEST3N4P5Q6R", "rejected", "Amount on the slip does not match the plan price. Please resubmit."),
]


def proof_png(width: int = 360, height: int = 200, rgb=(230, 236, 250)) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


async def run(password: str) -> None:
    async with AsyncSessionLocal() as db:
        svc = await db.scalar(select(PlatformService).where(PlatformService.code == "manual_payment"))
        if svc is None:
            sys.exit("Run the database migrations first (manual_payment row missing).")
        if not await manual_accounts(db):
            svc.credentials_enc = encrypt_creds(TEST_ACCOUNTS)
            svc.is_enabled = True
            print("Filled manual payment accounts with TEST values - replace them in the admin panel (Payments).")
        plans = {p.code: p for p in await db.scalars(select(Plan))}
        for email, company, plan_code, method, trx, status, note in CASES:
            if await db.scalar(select(User).where(User.email == email)):
                print(f"skip {email} (exists)")
                continue
            plan = plans[plan_code]
            user = User(email=email, hashed_password=hash_password(password), pending_org_name=company, pending_phone="01700000000",
                        pending_industry="ecommerce_retail", pending_company_size="1-10", pending_language="en")
            db.add(user)
            await db.flush()
            sub = Subscription(user_id=user.id, plan_id=plan.id, tran_id=f"test-{trx.lower()}",
                               status=SubscriptionStatus.ACTIVE if status == "approved" else SubscriptionStatus.FAILED if status == "rejected" else SubscriptionStatus.PENDING,
                               source="manual" if status == "approved" else "payment")
            db.add(sub)
            await db.flush()
            pay = ManualPayment(user_id=user.id, subscription_id=sub.id, method=method, amount_bdt=plan.price_bdt,
                                sender_account="01712345678" if method != "bank" else "A/C 1234567890", trx_id=trx,
                                customer_note="Test payment", status=status, admin_note=note,
                                reviewed_by=None if status == "pending" else "seed", reviewed_at=None if status == "pending" else datetime.now(timezone.utc))
            db.add(pay)
            await db.flush()
            data = proof_png()
            db.add(ManualPaymentDocument(payment_id=pay.id, filename=f"{method}-receipt.png", content_type="image/png", size=len(data), data=data))
            print(f"created {email}: {plan.name} {plan.price_bdt} BDT via {method} [{status}]")
        await db.commit()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--password", required=True, help="password for all test users (12+ characters)")
    a = ap.parse_args()
    if len(a.password) < 12:
        sys.exit("Use at least 12 characters.")
    asyncio.run(run(a.password))
