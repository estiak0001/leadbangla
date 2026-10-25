"""Seed a realistic team for a demo company: every role, custom access, a pending and an expired invite,
a switched-off employee, lead owners, assigned tasks with comments, presets, access log and notifications.

    docker compose exec backend python -m app.scripts.seed_team_demo                  # demo1's company
    docker compose exec backend python -m app.scripts.seed_team_demo --email demo2@leadbangla.com
    docker compose exec backend python -m app.scripts.seed_team_demo --clear          # remove the seeded teammates again

Run `seed_crm_demo` first if you also want the demo leads (owners are spread across the team).
All seeded people sign in with  demopass123  (except the two pending invites, who have not set a password).
This resets the team demo for the company: seeded tasks, notifications and the access log are rebuilt.
"""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update

from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models.contact import Contact
from app.models.crm import CrmTask, CrmTaskComment, TeamAccessPreset, TeamAuditLog
from app.models.enums import TenantRole
from app.models.inbox import Notification
from app.models.organization import OrganizationMember
from app.models.user import User

TAG = "[demo-team]"
PASSWORD = "demopass123"
now = datetime.now(timezone.utc)

# email, role, job title, permissions (None = role default), joined days ago, last seen, status
PEOPLE = [
    ("admin1@leadbangla.com", TenantRole.ADMIN, "Operations Manager", None, 60, timedelta(minutes=12), "active"),
    ("marketing1@leadbangla.com", TenantRole.MEMBER, "Marketing Executive", None, 45, timedelta(hours=3), "active"),
    ("support1@leadbangla.com", TenantRole.MEMBER, "Customer Support", ["contacts", "crm", "sms", "whatsapp"], 30, timedelta(days=1), "active"),
    ("sales1@leadbangla.com", TenantRole.SALES, "Sales Executive — Dhaka", None, 40, timedelta(minutes=45), "active"),
    ("sales2@leadbangla.com", TenantRole.SALES, "Sales Executive — Chattogram", None, 25, timedelta(days=2), "active"),
    ("intern1@leadbangla.com", TenantRole.MEMBER, "Intern (on leave)", ["contacts"], 20, timedelta(days=9), "off"),
    ("newhire@leadbangla.com", TenantRole.MEMBER, "Page Admin", ["contacts", "crm", "growth"], 3, None, "pending"),
    ("old.invite@leadbangla.com", TenantRole.SALES, "Sales Executive — Sylhet", None, 10, None, "expired"),
]
PRESETS = {"Telesales": ["contacts", "crm", "sms"], "Marketing": ["contacts", "email", "sms", "whatsapp", "landing_pages", "growth", "analytics"],
           "Support desk": ["contacts", "crm", "whatsapp"]}


async def org_for(db, email):
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        raise SystemExit(f"No user {email}")
    m = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == user.id))
    if m is None:
        raise SystemExit(f"{email} has no company")
    return m.organization_id, user


async def clear(db, org_id):
    emails = [p[0] for p in PEOPLE if p[0] != "sales1@leadbangla.com"]
    users = list(await db.scalars(select(User).where(User.email.in_(emails))))
    ids = [u.id for u in users]
    if ids:
        await db.execute(update(Contact).where(Contact.owner_user_id.in_(ids)).values(owner_user_id=None))
        await db.execute(delete(CrmTaskComment).where(CrmTaskComment.user_id.in_(ids)))
        await db.execute(update(CrmTask).where(CrmTask.assignee_user_id.in_(ids)).values(assignee_user_id=None))
        await db.execute(delete(Notification).where(Notification.user_id.in_(ids)))
        await db.execute(delete(OrganizationMember).where(OrganizationMember.user_id.in_(ids)))
    await db.execute(delete(CrmTask).where(CrmTask.organization_id == org_id, CrmTask.description.like(f"{TAG}%")))
    await db.execute(delete(TeamAuditLog).where(TeamAuditLog.organization_id == org_id))
    await db.execute(delete(TeamAccessPreset).where(TeamAccessPreset.organization_id == org_id))
    if ids:
        await db.execute(delete(User).where(User.id.in_(ids)))
    await db.commit()
    return len(ids)


async def main(email: str, only_clear: bool) -> None:
    async with AsyncSessionLocal() as db:
        org_id, owner = await org_for(db, email)
        # tasks/notifications from an earlier seed
        await db.execute(delete(CrmTaskComment).where(CrmTaskComment.task_id.in_(
            select(CrmTask.id).where(CrmTask.organization_id == org_id, CrmTask.description.like(f"{TAG}%")))))
        await db.execute(delete(CrmTask).where(CrmTask.organization_id == org_id, CrmTask.description.like(f"{TAG}%")))
        await db.execute(delete(Notification).where(Notification.organization_id == org_id))
        await db.execute(delete(TeamAuditLog).where(TeamAuditLog.organization_id == org_id))
        await db.commit()
        if only_clear:
            print(f"Removed {await clear(db, org_id)} seeded teammates.")
            return

        users: dict[str, User] = {}
        for em, role, title, perms, joined, seen, status in PEOPLE:
            u = await db.scalar(select(User).where(User.email == em))
            if u is None:
                u = User(email=em, hashed_password=hash_password(PASSWORD), is_active=True)
                db.add(u)
                await db.flush()
            u.must_change_password = False
            if status in ("pending", "expired"):
                u.hashed_password = hash_password("not-set-" + em)   # nobody knows it; they must use the invite link
            m = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == u.id))
            if m is None:
                m = OrganizationMember(organization_id=org_id, user_id=u.id, role=role)
                db.add(m)
            m.organization_id, m.role, m.job_title, m.permissions = org_id, role, title, perms
            m.is_active = status != "off"
            m.invite_pending = status in ("pending", "expired")
            m.invited_at = now - timedelta(days=joined) if m.invite_pending else None
            m.invited_by_user_id = owner.id
            m.last_seen_at = (now - seen) if seen else None
            m.created_at = now - timedelta(days=joined)
            users[em] = u
        owner_m = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == owner.id))
        owner_m.job_title = owner_m.job_title or "Founder & CEO"
        owner_m.last_seen_at = now
        for name, perms in PRESETS.items():
            if not await db.scalar(select(TeamAccessPreset.id).where(TeamAccessPreset.organization_id == org_id, TeamAccessPreset.name == name)):
                db.add(TeamAccessPreset(organization_id=org_id, name=name, permissions=perms))
        await db.commit()

        uid = {k: v.id for k, v in users.items()}
        uid["owner"] = owner.id

        # Lead owners spread across the team (only the people who work leads)
        leads = list(await db.scalars(select(Contact).where(Contact.organization_id == org_id, Contact.deleted_at.is_(None)).order_by(Contact.created_at)))
        rota = [uid["sales1@leadbangla.com"], uid["sales2@leadbangla.com"], uid["admin1@leadbangla.com"], uid["support1@leadbangla.com"],
                uid["marketing1@leadbangla.com"], uid["owner"]]
        for i, c in enumerate(leads):
            c.owner_user_id = rota[i % len(rota)]
        await db.commit()

        # Tasks: assigned by owner/admin to different roles, mixed status, a few with comments
        def due(days, hour=10):
            return (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
        TASKS = [
            ("Prepare Eid offer email campaign", "marketing1@leadbangla.com", "owner", due(2), "high", "Draft, review and schedule. Use the Eid template.", False, ["Draft is ready in the editor.", "Looks good — schedule it for Friday 9am."]),
            ("Clean up duplicate contacts after import", "support1@leadbangla.com", "admin1@leadbangla.com", due(-1), "normal", "Check Contacts for same phone with different spelling.", False, []),
            ("Call back the 5 hottest leads", "sales1@leadbangla.com", "admin1@leadbangla.com", due(0, 17), "high", "Start with Negotiation stage.", False, ["Called 3, two want a quote."]),
            ("Visit wholesale customers in Agrabad", "sales2@leadbangla.com", "admin1@leadbangla.com", due(3), "normal", "Take the new catalogue.", False, []),
            ("Collect pending dues from wholesale customers", "sales2@leadbangla.com", "owner", due(-2), "high", "See the Dues tab for who owes what.", False, ["Two promised to pay Thursday."]),
            ("Update the landing page headline", "marketing1@leadbangla.com", "admin1@leadbangla.com", due(5), "low", "A/B test the Bangla headline.", False, []),
            ("Send WhatsApp catalogue to new leads", "support1@leadbangla.com", "owner", due(1), "normal", "", True, ["Done — 12 sent."]),
            ("Monthly sales review slides", "admin1@leadbangla.com", "owner", due(7), "normal", "Funnel + win rate from the CRM reports.", False, []),
            ("Top up SMS wallet before the campaign", "admin1@leadbangla.com", "owner", due(-1), "high", "Balance is low.", True, []),
        ]
        task_ids = {}
        for title, who, by, when, prio, desc, done, comments in TASKS:
            t = CrmTask(organization_id=org_id, contact_id=None, assignee_user_id=uid[who], created_by_user_id=uid[by] if by in uid else uid["owner"],
                        title=title, kind="follow_up", due_at=when, priority=prio, description=f"{TAG} {desc}".strip(),
                        done_at=(when - timedelta(hours=3)) if done else None, reminded_at=now if when < now else None)
            db.add(t)
            await db.flush()
            task_ids[title] = t.id
            for j, text in enumerate(comments):
                author = uid[who] if j % 2 == 0 else (uid[by] if by in uid else uid["owner"])
                db.add(CrmTaskComment(organization_id=org_id, task_id=t.id, user_id=author, body=text, created_at=now - timedelta(hours=6 - j * 2)))
        await db.commit()

        # Access log
        def log(days, hours, actor, target, action, detail):
            db.add(TeamAuditLog(organization_id=org_id, actor_user_id=uid.get(actor, owner.id), target_user_id=uid.get(target), action=action,
                                detail=detail, created_at=now - timedelta(days=days, hours=hours)))
        log(60, 0, "owner", "admin1@leadbangla.com", "member_added", "Created account for admin1@leadbangla.com as admin")
        log(45, 0, "admin1@leadbangla.com", "marketing1@leadbangla.com", "member_added", "Invited marketing1@leadbangla.com as member")
        log(40, 0, "admin1@leadbangla.com", "sales1@leadbangla.com", "member_added", "Invited sales1@leadbangla.com as sales")
        log(30, 0, "admin1@leadbangla.com", "support1@leadbangla.com", "member_added", "Invited support1@leadbangla.com as member")
        log(30, -1, "admin1@leadbangla.com", "support1@leadbangla.com", "access_changed", "support1@leadbangla.com: access set to Contacts & segments, CRM & tasks, SMS, WhatsApp")
        log(25, 0, "admin1@leadbangla.com", "sales2@leadbangla.com", "member_added", "Created account for sales2@leadbangla.com as sales")
        log(20, 0, "admin1@leadbangla.com", "intern1@leadbangla.com", "member_added", "Invited intern1@leadbangla.com as member")
        log(10, 0, "admin1@leadbangla.com", "old.invite@leadbangla.com", "member_added", "Invited old.invite@leadbangla.com as sales")
        log(3, 0, "admin1@leadbangla.com", "newhire@leadbangla.com", "member_added", "Invited newhire@leadbangla.com as member")
        log(2, 0, "owner", "intern1@leadbangla.com", "access_off", "intern1@leadbangla.com: access turned off")
        log(1, 2, "owner", "marketing1@leadbangla.com", "password_reset", "Sent a password reset link to marketing1@leadbangla.com")
        log(0, 5, "owner", None, "preset_saved", "Access preset “Telesales” saved")
        await db.commit()

        # Notifications so every role has something in the bell
        def note(user, category, kind, title, body="", link=None, actor="owner", mins=30, read=False):
            db.add(Notification(organization_id=org_id, user_id=uid[user], category=category, kind=kind, title=title, body=body, link=link,
                                actor_user_id=uid.get(actor), created_at=now - timedelta(minutes=mins), read_at=(now - timedelta(minutes=mins - 5)) if read else None))
        note("owner", "tasks", "task_comment", "marketing1 commented on “Prepare Eid offer email campaign”", "Draft is ready in the editor.", "/crm?tab=tasks", "marketing1@leadbangla.com", 20)
        note("owner", "team", "member_joined", "newhire@leadbangla.com accepted the invite and joined your team", "", "/team", "newhire@leadbangla.com", 300, True)
        note("owner", "billing", "low_balance", "Wallet balance is low: ৳442.17", "Below your alert level of ৳500.00. Top up to keep campaigns running.", "/billing?tab=wallet", "owner", 700)
        note("admin1@leadbangla.com", "tasks", "task_assigned", "demo1 assigned you a task: Monthly sales review slides", "Due next week · priority normal", "/crm?tab=tasks", "owner", 90)
        note("admin1@leadbangla.com", "tasks", "task_done", "demo1 completed: Top up SMS wallet before the campaign", "", "/crm?tab=tasks", "owner", 600, True)
        note("marketing1@leadbangla.com", "tasks", "task_assigned", "demo1 assigned you a task: Prepare Eid offer email campaign", "Due in 2 days · priority high", "/crm?tab=tasks", "owner", 240)
        note("marketing1@leadbangla.com", "campaigns", "campaign_sent", "Email campaign “New arrivals” finished sending", "120 recipients", "/campaigns", "marketing1@leadbangla.com", 1500, True)
        note("support1@leadbangla.com", "team", "access_changed", "Your access to areas of LeadBangla was updated", "", "/profile", "admin1@leadbangla.com", 1200)
        note("support1@leadbangla.com", "tasks", "task_due", "Task due: Clean up duplicate contacts after import", "Was due yesterday", "/crm?tab=tasks", None, 60)
        note("sales1@leadbangla.com", "leads", "lead_assigned", "admin1 assigned you a lead: Jahid Hasan", "", "/crm", "admin1@leadbangla.com", 50)
        note("sales1@leadbangla.com", "tasks", "task_assigned", "admin1 assigned you a task: Call back the 5 hottest leads", "Due today 5pm · priority high", "/crm?tab=tasks", "admin1@leadbangla.com", 130)
        note("sales2@leadbangla.com", "tasks", "task_comment", "demo1 commented on “Collect pending dues from wholesale customers”", "Two promised to pay Thursday.", "/crm?tab=tasks", "owner", 180)
        note("sales2@leadbangla.com", "leads", "lead_won", "Masud Rana was won 🎉", "", "/crm", "admin1@leadbangla.com", 2000, True)
        await db.commit()
        print(f"Team seeded for {email}'s company: owner + {len(PEOPLE)} people ({len(leads)} leads spread across them), {len(TASKS)} tasks, {len(PRESETS)} presets.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default="demo1@leadbangla.com")
    ap.add_argument("--clear", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(a.email, a.clear))
