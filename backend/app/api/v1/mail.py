import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.mail import InboxAddress, InboxDomain
from app.models.organization import OrganizationMember
from app.services import mail_service as ms
from app.services.email_provider_service import get_ses_config

router = APIRouter(prefix="/mail", tags=["mail"])


def _bad(e: Exception) -> HTTPException:
    if isinstance(e, ms.NotFound):
        return HTTPException(status_code=404, detail="Not found")
    return HTTPException(status_code=400, detail=str(e))


def _domain(d: InboxDomain) -> dict:
    return {"id": d.id, "sending_domain_id": d.sending_domain_id, "receive_domain": d.receive_domain, "status": d.status, "catch_all": d.catch_all,
            "mx": {"type": "MX", "host": d.receive_domain, "data": d.mx_value, "priority": 10, "target": d.mx_value.split()[-1]},
            "status_note": d.status_note, "dns_submitted_at": d.dns_submitted_at, "last_checked_at": d.last_checked_at, "created_at": d.created_at}


def _address(a: InboxAddress, domain: str) -> dict:
    return {"id": a.id, "inbox_domain_id": a.inbox_domain_id, "local_part": a.local_part, "email": f"{a.local_part}@{domain}",
            "display_name": a.display_name, "is_default": a.is_default}


@router.get("/setup")
async def setup(m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    """Everything the Setup screen needs, and whether the platform itself is ready to receive mail."""
    cfg = await get_ses_config(db)
    if cfg is None:
        ready, why = False, "Email isn't connected on this platform yet. An administrator must connect Amazon SES first."
    elif not cfg.get("inbound_bucket"):
        ready, why = False, "The shared inbox isn't enabled on this platform yet. An administrator needs to add the inbound mail bucket in the Amazon SES settings."
    else:
        ready, why = True, None
    domains = await ms.list_inbox_domains(db, m.organization_id)
    dmap = {d.id: d.receive_domain for d in domains}
    addrs = [_address(a, dmap.get(a.inbox_domain_id, "")) for a in await ms.list_addresses(db, m.organization_id)]
    from app.models.email_domain import SendingDomain  # noqa: PLC0415

    sending = list(await db.scalars(select(SendingDomain).where(SendingDomain.organization_id == m.organization_id, SendingDomain.deleted_at.is_(None),
                                                                 SendingDomain.status == "verified", SendingDomain.provider == "ses")))
    return {"platform_ready": ready, "platform_message": why, "region": cfg["region"] if cfg else None,
            "domains": [_domain(d) for d in domains], "addresses": addrs,
            "sending_domains": [{"id": s.id, "domain": s.domain} for s in sending], "retention_days": settings.mail_retention_days}


class DomainCreate(BaseModel):
    sending_domain_id: uuid.UUID
    receive_domain: str = Field(min_length=3, max_length=255)


@router.post("/domains", status_code=status.HTTP_201_CREATED)
async def create_domain(p: DomainCreate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return _domain(await ms.create_inbox_domain(db, m.organization_id, p.sending_domain_id, p.receive_domain))
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)


@router.post("/domains/{domain_id}/verify")
async def verify_domain(domain_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return _domain(await ms.verify_inbox_domain(db, m.organization_id, domain_id))
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)


class Toggle(BaseModel):
    enabled: bool


@router.post("/domains/{domain_id}/enabled")
async def toggle_domain(domain_id: uuid.UUID, p: Toggle, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return _domain(await ms.set_inbox_enabled(db, m.organization_id, domain_id, p.enabled))
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)


class CatchAll(BaseModel):
    value: bool


@router.post("/domains/{domain_id}/catch-all")
async def catch_all(domain_id: uuid.UUID, p: CatchAll, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return _domain(await ms.set_catch_all(db, m.organization_id, domain_id, p.value))
    except ms.NotFound as e:
        raise _bad(e)


class AddressCreate(BaseModel):
    inbox_domain_id: uuid.UUID
    local_part: str = Field(min_length=1, max_length=64)
    display_name: str | None = Field(default=None, max_length=120)


@router.post("/addresses", status_code=status.HTTP_201_CREATED)
async def create_address(p: AddressCreate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        a = await ms.add_address(db, m.organization_id, p.inbox_domain_id, p.local_part, p.display_name)
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)
    return _address(a, (await db.get(InboxDomain, a.inbox_domain_id)).receive_domain)


class AddressUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    make_default: bool = False
    local_part: str | None = Field(default=None, min_length=1, max_length=64)
    inbox_domain_id: uuid.UUID | None = None


@router.put("/addresses/{address_id}")
async def update_address(address_id: uuid.UUID, p: AddressUpdate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        a = await ms.update_address(
            db, m.organization_id, address_id, display_name=p.display_name, make_default=p.make_default,
            local_part=p.local_part, inbox_domain_id=p.inbox_domain_id)
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)
    return _address(a, (await db.get(InboxDomain, a.inbox_domain_id)).receive_domain)


@router.delete("/addresses/{address_id}", status_code=204)
async def remove_address(address_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> None:
    try:
        await ms.delete_address(db, m.organization_id, address_id)
    except ms.NotFound as e:
        raise _bad(e)


# ── reading ──────────────────────────────────────────────────────────────────

@router.get("/counts")
async def counts(m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    return await ms.counts(db, m.organization_id)


@router.get("/threads")
async def threads(folder: str = "inbox", q: str | None = None, unread_only: bool = False, assigned: str | None = None,
                  limit: int = Query(30, le=100), offset: int = 0,
                  m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> list[dict]:
    try:
        return await ms.list_threads(db, m.organization_id, folder=folder, q=q, unread_only=unread_only, assigned=assigned, limit=limit, offset=offset, user_id=m.user_id)
    except ms.MailError as e:
        raise _bad(e)


@router.get("/threads/{thread_id}")
async def thread(thread_id: uuid.UUID, images: bool = False, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await ms.thread_detail(db, m.organization_id, thread_id, images=images)
    except ms.NotFound as e:
        raise _bad(e)


class ReadBody(BaseModel):
    read: bool = True


@router.post("/threads/{thread_id}/read", status_code=204)
async def read(thread_id: uuid.UUID, p: ReadBody, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> None:
    try:
        await ms.mark_read(db, m.organization_id, thread_id, p.read)
    except ms.NotFound as e:
        raise _bad(e)


class ThreadPatch(BaseModel):
    folder: str | None = None
    starred: bool | None = None


@router.patch("/threads/{thread_id}")
async def patch_thread(thread_id: uuid.UUID, p: ThreadPatch, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        t = await ms.update_thread(db, m.organization_id, thread_id, folder=p.folder, starred=p.starred)
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)
    return ms.thread_row(t)


class AssignBody(BaseModel):
    user_id: uuid.UUID | None = None


@router.post("/threads/{thread_id}/assign")
async def assign(thread_id: uuid.UUID, p: AssignBody, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return ms.thread_row(await ms.assign_thread(db, m.organization_id, thread_id, p.user_id))
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)


@router.post("/threads/{thread_id}/contact")
async def save_contact(thread_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        c = await ms.contact_from_thread(db, m.organization_id, thread_id, m.user_id)
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)
    return {"id": c.id, "first_name": c.first_name, "last_name": c.last_name, "email": c.email}


@router.get("/messages/{message_id}/attachments/{idx}")
async def download(message_id: uuid.UUID, idx: int, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> Response:
    try:
        data, name, _ctype = await ms.attachment_bytes(db, m.organization_id, message_id, idx)
    except (ms.MailError, ms.NotFound, Exception) as e:  # noqa: BLE001
        if isinstance(e, (ms.MailError, ms.NotFound)):
            raise _bad(e)
        raise HTTPException(status_code=502, detail=str(e))
    safe = name.replace('"', "").replace("\n", " ")
    # always a download, never shown inline (a received file is untrusted)
    return Response(content=data, media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{safe}"', "X-Content-Type-Options": "nosniff"})


# ── writing ──────────────────────────────────────────────────────────────────

@router.post("/uploads", status_code=201)
async def upload(file: UploadFile = File(...), m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    data = await file.read(settings.mail_max_attachment_mb * 1024 * 1024 + 1)
    try:
        u = await ms.save_upload(db, m.organization_id, m.user_id, file.filename or "file", file.content_type or "application/octet-stream", data)
    except ms.MailError as e:
        raise _bad(e)
    return {"id": u.id, "filename": u.filename, "size": u.size, "content_type": u.content_type}


class SendBody(BaseModel):
    address_id: uuid.UUID
    to: list[str]
    cc: list[str] = []
    subject: str = Field(default="", max_length=500)
    text: str = Field(min_length=1, max_length=200_000)
    thread_id: uuid.UUID | None = None
    upload_ids: list[uuid.UUID] = []


@router.post("/send", status_code=201)
async def send(p: SendBody, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        msg = await ms.send_mail(db, m.organization_id, m.user_id, address_id=p.address_id, to=p.to, cc=p.cc, subject=p.subject, text=p.text,
                                 thread_id=p.thread_id, upload_ids=p.upload_ids)
    except (ms.MailError, ms.NotFound) as e:
        raise _bad(e)
    return {"id": msg.id, "thread_id": msg.thread_id, "status": msg.status}


class DevIngest(BaseModel):
    raw: str = Field(min_length=10, max_length=2_000_000)
    recipients: list[str] = []


@router.post("/dev/ingest")
async def dev_ingest(p: DevIngest, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    """Development only: file a pasted raw email as if it had just arrived (no AWS needed). Disabled in production."""
    if settings.environment == "production":
        raise HTTPException(status_code=404, detail="Not found")
    made = await ms.ingest_raw_email(db, p.raw.encode(), recipients=p.recipients or None)
    mine = [x for x in made if x.organization_id == m.organization_id]
    return {"filed": len(mine), "thread_ids": [x.thread_id for x in mine]}
