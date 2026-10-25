"""WhatsApp template approval: customer request -> platform review -> Meta review -> usable in campaigns."""
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import meta_whatsapp as meta
from app.integrations import whatsapp_gateway
from app.models.organization import Organization
from app.models.user import User
from app.models.whatsapp_template import WhatsAppTemplateRequest as Req

log = logging.getLogger(__name__)
OPEN = ("pending", "with_meta")
CATEGORIES = ("utility", "marketing", "authentication")
LANGUAGES = {"en": "English", "en_US": "English (US)", "bn": "Bangla"}
STATUS_LABEL = {"pending": "Waiting for our review", "rejected": "Not approved", "with_meta": "With Meta for approval",
                "approved": "Approved", "meta_rejected": "Rejected by Meta", "cancelled": "Cancelled"}


class TemplateError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s[:40] or "template"


def validate_body(body: str, examples: list[str]) -> list[str]:
    body = body.strip()
    if not body:
        raise TemplateError("Write the message text.")
    if len(body) > 1024:
        raise TemplateError("WhatsApp templates can be at most 1,024 characters.")
    nums = [int(n) for n in re.findall(r"\{\{(\d+)\}\}", body)]
    want = sorted(set(nums))
    if want != list(range(1, len(want) + 1)):
        raise TemplateError("Blanks must be numbered {{1}}, {{2}}, {{3}} in order, with none missing.")
    if re.match(r"^\s*\{\{\d+\}\}", body) or re.search(r"\{\{\d+\}\}\s*$", body):
        raise TemplateError("A template can't start or end with a blank. Add some words before and after it.")
    ex = [e.strip() for e in examples if e and e.strip()]
    if len(ex) < len(want):
        raise TemplateError(f"Give an example value for each blank ({len(want)} needed). Meta uses them to review the template.")
    return ex[: len(want)]


def read(r: Req, org_name: str | None = None) -> dict:
    return {"id": r.id, "organization_name": org_name, "label": r.label, "meta_name": r.meta_name, "language": r.language, "category": r.category,
            "body": r.body, "examples": r.examples or [], "status": r.status, "status_label": STATUS_LABEL.get(r.status, r.status),
            "admin_note": r.admin_note, "meta_reason": r.meta_reason, "reviewed_by": r.reviewed_by, "reviewed_at": r.reviewed_at, "created_at": r.created_at}


async def create(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID | None, *, label: str, language: str, category: str, body: str, examples: list[str]) -> Req:
    label = label.strip()
    if len(label) < 2:
        raise TemplateError("Give the template a name.")
    if language not in LANGUAGES:
        raise TemplateError("Choose a language.")
    if category not in CATEGORIES:
        raise TemplateError("Choose a category.")
    ex = validate_body(body, examples)
    open_n = await db.scalar(select(func.count(Req.id)).where(Req.organization_id == org_id, Req.status.in_(OPEN)))
    if (open_n or 0) >= 10:
        raise TemplateError("You already have 10 templates waiting for approval. Wait for some to finish first.")
    base = f"{_slug(label)}_{str(org_id).replace('-', '')[:6]}"
    name, n = base, 1
    while await db.scalar(select(Req.id).where(Req.meta_name == name)):
        n += 1
        name = f"{base}_{n}"
    req = Req(organization_id=org_id, created_by_user_id=user_id, label=label[:100], meta_name=name, language=language, category=category, body=body.strip(), examples=ex)
    own = await whatsapp_gateway.own_creds(db, org_id)
    if own and own.get("waba_id"):
        # Their own Meta account: no review by us, it goes straight to Meta.
        try:
            res = await meta.create_template(own, name=name, language=language, category=category, body=req.body, examples=ex)
        except meta.MetaWhatsAppError as e:
            raise TemplateError(f"Meta didn't accept it: {e}") from e
        req.meta_template_id = str(res.get("id") or "")
        req.status = "approved" if (res.get("status") or "").upper() == "APPROVED" else "with_meta"
        req.admin_note = "Sent straight to Meta from your own account."
    db.add(req)
    await db.commit()
    await db.refresh(req)
    await _notify_staff_hint(db, req)
    return req


async def _notify_staff_hint(db: AsyncSession, req: Req) -> None:
    log.info("WhatsApp template request %s from org %s waiting for review", req.meta_name, req.organization_id)


async def list_for_org(db: AsyncSession, org_id: uuid.UUID) -> list[Req]:
    rows = list((await db.scalars(select(Req).where(Req.organization_id == org_id).order_by(Req.created_at.desc()))).all())
    own = await whatsapp_gateway.own_creds(db, org_id)
    if own and own.get("waba_id"):       # their webhook may not be set up, so refresh what is still with Meta
        for r in [x for x in rows if x.status == "with_meta"][:10]:
            try:
                st = next((s for s in await meta.template_status(own, r.meta_name) if s.get("language") == r.language), None)
                if st:
                    await apply_meta_status(db, meta_name=r.meta_name, event=st.get("status", ""), reason=st.get("rejected_reason"))
            except meta.MetaWhatsAppError:
                break
        rows = list((await db.scalars(select(Req).where(Req.organization_id == org_id).order_by(Req.created_at.desc()))).all())
    return rows


async def cancel(db: AsyncSession, org_id: uuid.UUID, request_id: uuid.UUID) -> Req:
    req = await db.get(Req, request_id)
    if req is None or req.organization_id != org_id:
        raise TemplateError("Template request not found.", 404)
    if req.status != "pending":
        raise TemplateError("Only a request that is still waiting for our review can be cancelled.")
    req.status = "cancelled"
    await db.commit()
    return req


async def admin_list(db: AsyncSession, status: str | None = None) -> list[tuple[Req, str | None]]:
    q = select(Req, Organization.name).join(Organization, Organization.id == Req.organization_id).order_by(Req.created_at.desc())
    if status:
        q = q.where(Req.status == status)
    return [(r, n) for r, n in (await db.execute(q)).all()]


async def decide(db: AsyncSession, request_id: uuid.UUID, decision: str, note: str | None, admin_email: str) -> Req:
    """approve = send to Meta now; reject = tell the customer why."""
    req = await db.get(Req, request_id)
    if req is None:
        raise TemplateError("Template request not found.", 404)
    if req.status != "pending":
        raise TemplateError("This request was already handled.")
    note = (note or "").strip() or None
    if decision == "reject":
        if not note:
            raise TemplateError("Add a note so the customer knows what to change.")
        req.status = "rejected"
    elif decision == "approve":
        creds = await whatsapp_gateway.meta_creds_any(db)
        if not creds or not creds.get("waba_id"):
            raise TemplateError("Save the Meta access token and WhatsApp Business Account ID first (Connection tab).")
        try:
            res = await meta.create_template(creds, name=req.meta_name, language=req.language, category=req.category, body=req.body, examples=req.examples or [])
        except meta.MetaWhatsAppError as e:
            raise TemplateError(f"Meta didn't accept it: {e}") from e
        req.meta_template_id = str(res.get("id") or "")
        st = (res.get("status") or "PENDING").upper()
        req.status = "approved" if st == "APPROVED" else "with_meta"
    else:
        raise TemplateError("Unknown decision.")
    req.admin_note, req.reviewed_by, req.reviewed_at = note, admin_email, datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    await notify_owner(db, req)
    return req


async def apply_meta_status(db: AsyncSession, *, meta_name: str | None = None, template_id: str | None = None, event: str, reason: str | None = None) -> Req | None:
    """From the webhook or a manual sync: Meta approved, rejected or paused a template."""
    q = select(Req)
    if meta_name:
        q = q.where(Req.meta_name == meta_name)
    elif template_id:
        q = q.where(Req.meta_template_id == template_id)
    else:
        return None
    req = await db.scalar(q)
    if req is None:
        return None
    ev = (event or "").upper()
    new = {"APPROVED": "approved", "REJECTED": "meta_rejected", "PENDING": "with_meta", "IN_REVIEW": "with_meta",
           "PAUSED": "meta_rejected", "DISABLED": "meta_rejected"}.get(ev)
    if new is None or (new == req.status and (reason or "") == (req.meta_reason or "")):
        return req
    changed = new != req.status
    req.status = new
    req.meta_reason = (reason or None) if reason and reason.upper() != "NONE" else None
    await db.commit()
    if changed and new in ("approved", "meta_rejected"):
        await notify_owner(db, req)
    return req


async def sync_one(db: AsyncSession, request_id: uuid.UUID) -> Req:
    req = await db.get(Req, request_id)
    if req is None:
        raise TemplateError("Template request not found.", 404)
    creds = await whatsapp_gateway.meta_creds_any(db)
    if not creds or not creds.get("waba_id"):
        raise TemplateError("Save the Meta credentials first.")
    try:
        rows = await meta.template_status(creds, req.meta_name)
    except meta.MetaWhatsAppError as e:
        raise TemplateError(str(e)) from e
    row = next((r for r in rows if r.get("language") == req.language), rows[0] if rows else None)
    if row:
        req = await apply_meta_status(db, meta_name=req.meta_name, event=row.get("status", ""), reason=row.get("rejected_reason")) or req
    return req


async def owned_names(db: AsyncSession) -> dict[str, uuid.UUID]:
    """meta_name -> owning organisation, for every template request that exists."""
    return {n: o for n, o in (await db.execute(select(Req.meta_name, Req.organization_id))).all()}


async def notify_owner(db: AsyncSession, req: Req) -> None:
    try:
        from app.services import inbox  # noqa: PLC0415

        label = {"approved": "is approved ✅ and ready to use", "rejected": "was not approved", "with_meta": "was sent to Meta for review",
                 "meta_rejected": "was rejected by Meta"}.get(req.status)
        if not label:
            return
        note = req.admin_note if req.status == "rejected" else req.meta_reason
        await inbox.notify(db, req.organization_id, await inbox.owners_and_admins(db, req.organization_id), category="account",
                           kind=f"wa_template_{req.status}", title=f"WhatsApp template “{req.label}” {label}", body=note or "",
                           link="/whatsapp?tab=templates")
    except Exception:  # noqa: BLE001
        log.exception("template notification failed")
