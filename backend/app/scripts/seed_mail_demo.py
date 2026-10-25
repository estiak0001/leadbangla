"""Preview data for the shared inbox (demo account "Chittagong Grocers").

    python -m app.scripts.seed_mail_demo seed    # adds a fake verified domain, an active inbox, two addresses and five sample emails
    python -m app.scripts.seed_mail_demo clean   # removes all of it again

Development only: it never talks to AWS and uses a made-up domain (chittagong-demo.test).
"""
import asyncio, base64, sys
from sqlalchemy import select, delete
from app.core.db import AsyncSessionLocal
from app.models.organization import Organization
from app.models.email_domain import SendingDomain
from app.models.mail import InboxDomain, InboxAddress, MailThread
from app.services import mail_service as ms

def eml(frm, to, subject, body, mid, *, reply=None, html=None, attach=None, date="Mon, 26 Oct 2026 10:00:00 +0600"):
    h = f"From: {frm}\r\nTo: {to}\r\nSubject: {subject}\r\nMessage-ID: <{mid}>\r\nDate: {date}\r\nMIME-Version: 1.0\r\n"
    if reply: h += f"In-Reply-To: <{reply}>\r\nReferences: <{reply}>\r\n"
    if not (html or attach):
        return (h + f"Content-Type: text/plain; charset=utf-8\r\n\r\n{body}\r\n").encode()
    s = h + "Content-Type: multipart/mixed; boundary=B\r\n\r\n--B\r\nContent-Type: multipart/alternative; boundary=A\r\n\r\n--A\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + body + "\r\n--A\r\nContent-Type: text/html; charset=utf-8\r\n\r\n" + (html or f"<p>{body}</p>") + "\r\n--A--\r\n"
    if attach:
        s += f"--B\r\nContent-Type: application/pdf; name=\"{attach[0]}\"\r\nContent-Disposition: attachment; filename=\"{attach[0]}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n{base64.b64encode(attach[1]).decode()}\r\n"
    return (s + "--B--\r\n").encode()

async def main(mode):
    async with AsyncSessionLocal() as db:
        org = await db.scalar(select(Organization).where(Organization.name.like("Chittagong%")))
        if mode == "clean":
            sd = await db.scalar(select(SendingDomain).where(SendingDomain.domain == "chittagong-demo.test"))
            if sd: await db.delete(sd)          # cascades inbox domain, addresses
            await db.execute(delete(MailThread).where(MailThread.organization_id == org.id))
            await db.commit(); print("cleaned"); return
        sd = SendingDomain(organization_id=org.id, domain="chittagong-demo.test", provider="ses", status="verified", dns_records=[])
        db.add(sd); await db.flush()
        d = InboxDomain(organization_id=org.id, sending_domain_id=sd.id, receive_domain="mail.chittagong-demo.test", status="active",
                        mx_value="10 inbound-smtp.us-east-1.amazonaws.com", status_note="MX found. Mail sent to anything@mail.chittagong-demo.test now arrives in your inbox.")
        db.add(d); await db.flush()
        sup = await ms.add_address(db, org.id, d.id, "support", "Support Team")
        await ms.add_address(db, org.id, d.id, "sales", "Sales")
        T = "support@mail.chittagong-demo.test"
        news = '<h2>Weekly deals</h2><p>Hi team — this week: <a href="https://shop.example.com/deals">see all deals</a>.</p><img src="https://example.com/banner.png" alt="banner"><table border="1"><tr><td>Rice 5kg</td><td>৳420</td></tr></table><script>alert(1)</script>'
        mails = [
            (eml("Rahim Uddin <rahim@gmail.com>", T, "Order #1043 hasn't arrived", "Hello, I ordered a week ago and still have no delivery. Please help.", "a1@gmail.com", date="Sat, 24 Oct 2026 09:10:00 +0600"), {"spam": "PASS", "virus": "PASS", "spf": "PASS", "dkim": "PASS", "dmarc": "PASS"}),
            (eml("Rahim Uddin <rahim@gmail.com>", T, "Re: Order #1043 hasn't arrived", "Any update? I'm getting worried.", "a2@gmail.com", reply="a1@gmail.com", date="Sun, 25 Oct 2026 18:30:00 +0600"), {"spam": "PASS", "virus": "PASS"}),
            (eml("Nusrat Jahan <nusrat@corp-buyers.com>", "sales@mail.chittagong-demo.test", "Bulk order quotation — 200 cartons", "Please send your best price for 200 cartons of mustard oil. Spec attached.", "b1@corp.com", attach=("spec-sheet.pdf", b"%PDF-1.4 spec" * 100), date="Mon, 26 Oct 2026 08:05:00 +0600"), {"spam": "PASS", "virus": "PASS", "spf": "PASS", "dkim": "PASS", "dmarc": "PASS"}),
            (eml("Dhaka Wholesale <deals@dhaka-wholesale.com>", T, "Weekly deals for retailers", "Weekly deals — see HTML version.", "c1@dw.com", html=news, date="Mon, 26 Oct 2026 07:00:00 +0600"), {"spam": "PASS", "virus": "PASS", "spf": "PASS", "dkim": "PASS", "dmarc": "FAIL"}),
            (eml("Promo <win@lucky-prize.biz>", T, "YOU WON 1,000,000 TAKA!!!", "Click here now to claim your prize.", "d1@spam.biz", date="Mon, 26 Oct 2026 03:00:00 +0600"), {"spam": "FAIL", "virus": "PASS"}),
        ]
        for raw, v in mails:
            await ms.ingest_raw_email(db, raw, verdicts=v)
        print("seeded", await ms.counts(db, org.id))
asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "seed"))
