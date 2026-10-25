"""Replace an organisation's CRM pipeline with a clean demo: sensible stages plus
sample leads spread across them (with notes and email engagement, so lead scores vary).

    docker compose exec backend python -m app.scripts.seed_crm_demo                 # demo1's company
    docker compose exec backend python -m app.scripts.seed_crm_demo --email demo2@leadbangla.com
    docker compose exec backend python -m app.scripts.seed_crm_demo --clear         # remove the sample leads again

Sample leads are tagged "demo-crm" so they are easy to find and remove. Existing pipeline stages are
removed first (other contacts move into the first stage). Also creates a restricted sales teammate
(sales1@leadbangla.com / demopass123) so owners, "My leads" and the sales role can be tried.
"""
import argparse
import asyncio
import random
from datetime import datetime, timedelta, timezone

from datetime import date

from sqlalchemy import delete, select, update

from app.core.db import AsyncSessionLocal
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.core.security import hash_password
from app.models.crm import Location
from app.services.location_service import resolve_place
from app.models.crm import (
    ConsentLog, ContactNote, CrmActivity, CrmDue, CrmTask, CustomFieldDefinition,
)
from app.models.enums import CampaignStatus, TenantRole
from app.models.enums import EventType
from app.models.event import Event
from app.models.organization import OrganizationMember
from app.models.user import User
from app.services.crm_service import create_stage, delete_stage, ensure_initialized, list_stages

TAG = "demo-crm"

STAGES = [("New Lead", "#3B82F6", "open"), ("Contacted", "#F59E0B", "open"), ("Interested", "#8B5CF6", "open"),
          ("Negotiation", "#EC4899", "open"), ("Customer", "#10B981", "won"), ("Lost", "#6B7280", "lost")]
CITIES = ["Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi", "Gazipur", "Cumilla"]
SOURCES = {"facebook": "facebook", "website": "website", "expo": "event", "referral": "referral", "vip": "referral", "newsletter": "website"}
AREA_BY_CITY = {"Dhaka": ["Gulshan", "Dhanmondi", "Uttara", "Mirpur"], "Chattogram": ["Agrabad", "Khulshi"], "Sylhet": ["Zindabazar"],
                "Khulna": ["Sonadanga"], "Rajshahi": ["Boalia"]}
COMPANIES = ["Rahim Fashion", "Fatema Boutique", "Karim Traders", "Nusrat Gadgets", "Sabbir Electronics", "Tania Beauty",
             "Imran Mobile Hub", "Mitu Collection", "Shakil Store", "Rumana Fabrics", "Jahid Wholesale", "Farhana Mart",
             "Arif Enterprise", "Sumaiya Shop", "Masud Bros", "Lipi Corner"]

# (first, last, email, phone, stage index, opens, clicks, tags, notes)
LEADS = [
    ("Rahim", "Uddin", "rahim.uddin.demo@example.com", "01711000001", 0, 0, 0, ["facebook"], []),
    ("ফাতেমা", "বেগম", "fatema.begum.demo@example.com", "01811000002", 0, 1, 0, ["website"], ["ওয়েবসাইট ফর্ম থেকে এসেছে।"]),
    ("Karim", "Ahmed", "karim.ahmed.demo@example.com", "01911000003", 0, 0, 0, ["expo"], []),
    ("Nusrat", "Jahan", "nusrat.jahan.demo@example.com", "01611000004", 0, 2, 0, ["facebook"], []),
    ("Sabbir", "Hossain", "sabbir.hossain.demo@example.com", "01511000005", 1, 3, 1, ["referral"], ["Called today — asked us to call back Thursday."]),
    ("Tania", "Akter", "tania.akter.demo@example.com", "01711000006", 1, 2, 1, ["website"], ["WhatsApp message sent, no reply yet."]),
    ("Imran", "Khan", "imran.khan.demo@example.com", "01811000007", 1, 4, 0, ["expo"], []),
    ("Mitu", "Rahman", "mitu.rahman.demo@example.com", "01911000008", 2, 5, 3, ["vip"], ["Wants a demo of SMS marketing.", "Sent the price list."]),
    ("Shakil", "Mahmud", "shakil.mahmud.demo@example.com", "01611000009", 2, 4, 4, ["newsletter"], ["Opens every email — good fit."]),
    ("Rumana", "Sultana", "rumana.sultana.demo@example.com", "01511000010", 2, 3, 2, ["referral"], []),
    ("Jahid", "Hasan", "jahid.hasan.demo@example.com", "01711000011", 3, 6, 5, ["vip", "wholesale"], ["Negotiating a yearly plan. Asked for 10% off.", "Decision expected this week."]),
    ("Farhana", "Yasmin", "farhana.yasmin.demo@example.com", "01811000012", 3, 5, 5, ["wholesale"], ["Comparing us with another provider."]),
    ("Arif", "Chowdhury", "arif.chowdhury.demo@example.com", "01911000013", 4, 8, 6, ["vip", "customer"], ["Signed up for the Growth plan 🎉"]),
    ("Sumaiya", "Islam", "sumaiya.islam.demo@example.com", "01611000014", 4, 7, 5, ["customer"], ["Happy customer — ask for a review."]),
    ("Masud", "Rana", "masud.rana.demo@example.com", "01511000015", 4, 9, 7, ["customer", "wholesale"], []),
    ("Lipi", "Khatun", "lipi.khatun.demo@example.com", "01711000016", 5, 1, 0, ["website"], ["Chose a competitor — budget reasons."]),
]


async def org_for(db, email: str):
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        raise SystemExit(f"No user {email}")
    m = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == user.id))
    if m is None:
        raise SystemExit(f"{email} has no company")
    return m.organization_id


async def clear_demo(db, org_id) -> int:
    ids = list(await db.scalars(select(Contact.id).where(Contact.organization_id == org_id, Contact.tags.contains([TAG]))))
    if ids:
        await db.execute(delete(Event).where(Event.contact_id.in_(ids)))
        from app.models.workflow import WorkflowEnrollment, WorkflowStepLog  # noqa: PLC0415

        enr = select(WorkflowEnrollment.id).where(WorkflowEnrollment.contact_id.in_(ids))
        await db.execute(delete(WorkflowStepLog).where(WorkflowStepLog.enrollment_id.in_(enr)))
        await db.execute(delete(WorkflowEnrollment).where(WorkflowEnrollment.contact_id.in_(ids)))
        for model in (CrmTask, CrmActivity, CrmDue, ConsentLog):
            await db.execute(delete(model).where(model.contact_id.in_(ids)))
        await db.execute(delete(ContactNote).where(ContactNote.contact_id.in_(ids)))
        from app.models.contact_history import ContactHistory  # noqa: PLC0415

        await db.execute(delete(ContactHistory).where(ContactHistory.contact_id.in_(ids)))
        await db.execute(delete(Contact).where(Contact.id.in_(ids)))
        demo_campaigns = list(await db.scalars(select(Campaign.id).where(Campaign.organization_id == org_id, Campaign.name.like("Demo CRM:%"))))
        if demo_campaigns:
            await db.execute(delete(Event).where(Event.campaign_id.in_(demo_campaigns)))
            await db.execute(delete(Campaign).where(Campaign.id.in_(demo_campaigns)))
        await db.commit()
    return len(ids)


async def main(email: str, clear: bool) -> None:
    async with AsyncSessionLocal() as db:
        org_id = await org_for(db, email)
        removed = await clear_demo(db, org_id)
        if clear:
            print(f"Removed {removed} sample leads.")
            return

        for st in await list_stages(db, org_id):          # start from a clean pipeline (also marks the CRM as set up)
            await delete_stage(db, org_id, st.id)
        stages = [await create_stage(db, org_id, name, i, color, outcome) for i, (name, color, outcome) in enumerate(STAGES)]
        await db.execute(update(Contact).where(Contact.organization_id == org_id, Contact.pipeline_stage_id.is_(None),
                                               Contact.deleted_at.is_(None)).values(pipeline_stage_id=stages[0].id))

        owner = await db.scalar(select(User).where(User.email == email))
        sales_user = await db.scalar(select(User).where(User.email == "sales1@leadbangla.com"))
        if sales_user is None:
            sales_user = User(email="sales1@leadbangla.com", hashed_password=hash_password("demopass123"), is_active=True)
            db.add(sales_user)
            await db.flush()
        if not await db.scalar(select(OrganizationMember.id).where(OrganizationMember.user_id == sales_user.id)):
            db.add(OrganizationMember(organization_id=org_id, user_id=sales_user.id, role=TenantRole.SALES))
        if not await db.scalar(select(CustomFieldDefinition.id).where(CustomFieldDefinition.organization_id == org_id)):
            db.add(CustomFieldDefinition(organization_id=org_id, key="shop_size", label="Shop size", field_type="select",
                                         options=["Small", "Medium", "Large"], position=0))
        await db.flush()

        # A handful of past email campaigns so engagement (and lead score) varies per lead.
        campaigns = []
        for i, nm in enumerate(["Eid offer", "New arrivals", "Winter sale", "Loyalty club", "Price list", "Restock alert"]):
            camp = Campaign(organization_id=org_id, name=f"Demo CRM: {nm}", subject=nm, html_body="<p>demo</p>",
                            status=CampaignStatus.SENT, sent_at=datetime.now(timezone.utc) - timedelta(days=30 - i * 4))
            db.add(camp)
            campaigns.append(camp)
        await db.flush()

        rng = random.Random(7)
        now = datetime.now(timezone.utc)
        made = 0
        owners = [owner.id, sales_user.id, None]
        for idx, (first, last, mail, phone, si, opens, clicks, tags, notes) in enumerate(LEADS):
            if await db.scalar(select(Contact.id).where(Contact.organization_id == org_id, Contact.email == mail, Contact.deleted_at.is_(None))):
                continue
            src = next((SOURCES[t] for t in tags if t in SOURCES), "facebook")
            city = CITIES[idx % len(CITIES)]
            area = (AREA_BY_CITY.get(city) or [None])[idx % len(AREA_BY_CITY.get(city) or [None])]
            place = await resolve_place(db, org_id, district=city, area=area)
            area_row = await db.scalar(select(Location).where(Location.organization_id == org_id, Location.kind == "area", Location.name == place["area"])) if place["area"] else None
            outcome = STAGES[si][2]
            c = Contact(
                organization_id=org_id, email=mail, phone=phone, first_name=first, last_name=last,
                tags=tags + [TAG], pipeline_stage_id=stages[si].id, sms_opt_in=si >= 2, whatsapp_opt_in=si >= 3,
                company=COMPANIES[idx], city=place["city"], division=place["division"], district=place["district"], area=place["area"],
                latitude=area_row.latitude if area_row else None, longitude=area_row.longitude if area_row else None, source=src,
                customer_type="wholesale" if "wholesale" in tags else "retail",
                owner_user_id=owners[idx % 3],
                deal_value=None if si == 0 else rng.choice([8, 15, 25, 40, 75, 120]) * 100_000,
                expected_close_date=(date.today() + timedelta(days=rng.randint(3, 30))) if outcome == "open" and si >= 2 else None,
                lost_reason="Chose a competitor — budget" if outcome == "lost" else None,
                stage_changed_at=(sc := now - timedelta(days=rng.randint(0, 12), hours=rng.randint(0, 20))),
                created_at=sc - timedelta(days=rng.randint(2, 40)),
                last_contacted_at=now - timedelta(days=rng.randint(0, 9)) if si >= 1 else None,
                custom_fields={"shop_size": rng.choice(["Small", "Medium", "Large"])},
            )
            db.add(c)
            await db.flush()
            for text in notes:
                db.add(ContactNote(organization_id=org_id, contact_id=c.id, content=text))
            for kind, n in ((EventType.OPENED, opens), (EventType.CLICKED, clicks)):
                for camp in campaigns[:max(0, min(n, len(campaigns)))]:
                    db.add(Event(organization_id=org_id, campaign_id=camp.id, contact_id=c.id, type=kind,
                                 occurred_at=now - timedelta(days=rng.randint(0, 20), hours=rng.randint(0, 23))))
            # Stage history + consent trail
            if si:
                db.add(CrmActivity(organization_id=org_id, contact_id=c.id, user_id=owner.id, kind="stage_change",
                                   summary=f"Moved from {STAGES[si - 1][0]} to {STAGES[si][0]}", data={"to": str(stages[si].id)},
                                   created_at=c.stage_changed_at))
            if si >= 1:
                db.add(CrmActivity(organization_id=org_id, contact_id=c.id, user_id=owner.id,
                                   kind=rng.choice(["call", "visit", "meeting"]), summary=rng.choice(
                                       ["Discussed product range", "Showed catalogue", "Asked about delivery charge", "Agreed to think it over"]),
                                   created_at=c.last_contacted_at))
            if c.sms_opt_in:
                db.add(ConsentLog(organization_id=org_id, contact_id=c.id, channel="sms", granted=True, method="import",
                                  recorded_by_user_id=owner.id, created_at=now - timedelta(days=20)))
            if c.whatsapp_opt_in:
                db.add(ConsentLog(organization_id=org_id, contact_id=c.id, channel="whatsapp", granted=True, method="manual",
                                  recorded_by_user_id=owner.id, created_at=now - timedelta(days=12)))
            # Follow-ups for open leads: some overdue, some today, some later
            if outcome == "open" and si <= 3:
                offset = [-2, -1, 0, 0, 1, 3, 5][idx % 7]
                db.add(CrmTask(organization_id=org_id, contact_id=c.id, assignee_user_id=c.owner_user_id or owner.id,
                               created_by_user_id=owner.id, kind=rng.choice(["call", "follow_up", "visit"]),
                               title=rng.choice(["Call back about the price list", "Send catalogue on WhatsApp", "Visit the shop", "Ask for decision"]),
                               due_at=(now + timedelta(days=offset)).replace(hour=9 + idx % 8, minute=0, second=0, microsecond=0)))
            # Baki for two wholesale customers
            if "wholesale" in tags:
                db.add(CrmDue(organization_id=org_id, contact_id=c.id, kind="due", amount=rng.choice([12, 25, 40]) * 100_000,
                              note="Eid stock on credit", due_date=date.today() + timedelta(days=rng.randint(-10, 15)),
                              created_by_user_id=owner.id))
            made += 1
        await db.commit()
        print(f"Pipeline reset: {len(stages)} stages, {made} sample leads for {email}'s company.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default="demo1@leadbangla.com")
    ap.add_argument("--clear", action="store_true", help="remove the sample leads and stop")
    a = ap.parse_args()
    asyncio.run(main(a.email, a.clear))
