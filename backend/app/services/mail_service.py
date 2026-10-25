"""Shared inbox on a customer's domain: receiving (via Amazon SES), reading, replying.

Flow in: SES -> S3 bucket + SNS -> /public/mail/inbound -> Celery -> ingest_raw_email -> threads/messages.
Flow out: send_mail builds a MIME message (threading headers, attachments) and sends it through SES.
Message bodies are encrypted at rest; the raw email stays in S3 only until the retention period ends."""
import asyncio
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import formataddr, formatdate, getaddresses, make_msgid, parseaddr, parsedate_to_datetime

import nh3
from sqlalchemy import and_, case, cast, func, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.core.config import settings
from app.core.text_crypto import seal, unseal
from app.integrations import mail_aws
from app.integrations.email_delivery import EmailSendError, _plain_text
from app.models.contact import Contact
from app.models.email_domain import SendingDomain
from app.models.mail import InboxAddress, InboxDomain, MailAttachment, MailMessage, MailThread, MailUpload
from app.models.organization import OrganizationMember
from app.services import email_domain_service as eds
from app.services import email_event_service
from app.services.email_provider_service import get_ses_config

log = logging.getLogger("mail")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
LOCAL_RE = re.compile(r"^[a-z0-9][a-z0-9._+\-]{0,63}$")
FOLDERS = ("inbox", "sent", "archive", "spam", "trash")
MAX_BODY = 1_000_000
MAX_RECIPIENTS = 20


class MailError(Exception):
    """User-facing problem (bad input, not set up, not allowed)."""


class NotFound(Exception):
    pass


# ── small helpers ────────────────────────────────────────────────────────────

def _mid(value: str | None) -> str | None:
    v = (value or "").strip().strip("<>").strip().lower()
    return v[:500] or None


def _snippet(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()[:160]


def _now() -> datetime:
    return datetime.now(timezone.utc)


ALLOWED_TAGS = {"a", "abbr", "b", "blockquote", "br", "center", "code", "div", "em", "font", "h1", "h2", "h3", "h4", "h5", "h6",
                "hr", "i", "li", "ol", "p", "pre", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot",
                "th", "thead", "tr", "u", "ul"}
ALLOWED_ATTRS = {"a": {"href", "title"}, "td": {"colspan", "rowspan", "align", "valign"}, "th": {"colspan", "rowspan", "align", "valign"},
                 "table": {"width", "border", "cellpadding", "cellspacing", "align"}, "font": {"color", "size"}}


def sanitize_html(html: str, *, allow_images: bool) -> str:
    """Safe to show in the app: no scripts, styles, forms, or tracking. Remote pictures only when the reader asks."""
    tags = ALLOWED_TAGS | ({"img"} if allow_images else set())
    attrs = {k: set(v) for k, v in ALLOWED_ATTRS.items()}
    if allow_images:
        attrs["img"] = {"src", "alt", "width", "height"}
    return nh3.clean(html, tags=tags, attributes=attrs, url_schemes={"http", "https", "mailto", "tel"},
                     link_rel="noopener noreferrer nofollow", strip_comments=True)


# ── parsing ──────────────────────────────────────────────────────────────────

def _body(part) -> str:
    if part is None:
        return ""
    try:
        return part.get_content()[:MAX_BODY]
    except Exception:  # noqa: BLE001 — odd charsets: decode leniently
        payload = part.get_payload(decode=True) or b""
        return payload.decode(part.get_content_charset() or "utf-8", errors="replace")[:MAX_BODY]


def parse_email(raw: bytes) -> dict:
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    name, addr = parseaddr(str(msg.get("From", "")))
    try:
        sent_at = parsedate_to_datetime(str(msg["Date"])) if msg.get("Date") else _now()
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
    except Exception:  # noqa: BLE001
        sent_at = _now()
    text = _body(msg.get_body(preferencelist=("plain",)))
    html = _body(msg.get_body(preferencelist=("html",)))
    if not text and html:
        text = _plain_text(html)
    attachments = []
    for i, part in enumerate(msg.iter_attachments()):
        data = part.get_payload(decode=True) or b""
        attachments.append({"idx": i, "filename": (part.get_filename() or f"attachment-{i + 1}")[:300],
                            "content_type": part.get_content_type(), "size": len(data)})
    auto = (str(msg.get("Auto-Submitted", "no")).strip().lower() not in ("", "no")
            or str(msg.get("Precedence", "")).strip().lower() in ("bulk", "junk", "list", "auto_reply")
            or bool(msg.get("X-Autoreply")) or bool(msg.get("X-Auto-Response-Suppress")))
    refs = [m for m in (_mid(x) for x in str(msg.get("References", "")).replace(",", " ").split()) if m]
    def addrs(h: str) -> list[dict]:
        return [{"email": a.lower(), "name": n} for n, a in getaddresses([str(x) for x in msg.get_all(h, [])]) if a]
    return {
        "from_email": addr.lower(), "from_name": name or None, "to": addrs("To"), "cc": addrs("Cc"),
        "subject": re.sub(r"\s+", " ", str(msg.get("Subject", ""))).strip()[:500], "sent_at": sent_at,
        "message_id": _mid(msg.get("Message-ID")), "in_reply_to": _mid(msg.get("In-Reply-To")), "references": refs,
        "text": text, "html": html, "attachments": attachments, "auto_generated": auto,
        "header_recipients": [a["email"] for a in addrs("To") + addrs("Cc")] + [a.lower() for _, a in getaddresses([str(msg.get("Delivered-To", "")), str(msg.get("X-Original-To", ""))]) if a],
    }


# ── inbox domains and addresses ──────────────────────────────────────────────

def _validate_receive_domain(sending: str, receive: str) -> str:
    receive = receive.strip().lower().removeprefix("http://").removeprefix("https://").strip("/")
    if not eds.DOMAIN_RE.match(receive):
        raise MailError("Enter a valid domain like mail.example.com")
    if receive != sending and not receive.endswith("." + sending):
        raise MailError(f"The inbox domain must be {sending} or a subdomain of it (for example mail.{sending}).")
    return receive


async def list_inbox_domains(db: AsyncSession, org_id: uuid.UUID) -> list[InboxDomain]:
    return list(await db.scalars(select(InboxDomain).where(InboxDomain.organization_id == org_id).order_by(InboxDomain.created_at)))


async def _get_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID) -> InboxDomain:
    d = await db.scalar(select(InboxDomain).where(InboxDomain.organization_id == org_id, InboxDomain.id == domain_id))
    if d is None:
        raise NotFound(domain_id)
    return d


async def create_inbox_domain(db: AsyncSession, org_id: uuid.UUID, sending_domain_id: uuid.UUID, receive_domain: str) -> InboxDomain:
    sd = await db.scalar(select(SendingDomain).where(SendingDomain.id == sending_domain_id, SendingDomain.organization_id == org_id, SendingDomain.deleted_at.is_(None)))
    if sd is None:
        raise NotFound(sending_domain_id)
    if sd.status not in ("verified",) or sd.provider != "ses":
        raise MailError("Verify this domain with Amazon SES first (Email Campaigns → Domains), then enable its inbox.")
    receive = _validate_receive_domain(sd.domain, receive_domain)
    if await db.scalar(select(InboxDomain.id).where(InboxDomain.receive_domain == receive)):
        raise MailError(f"{receive} already has an inbox.")
    cfg = await get_ses_config(db)
    if cfg is None:
        raise MailError("Amazon SES isn't connected on this platform.")
    try:
        await mail_aws.ensure_rule(cfg, receive)
    except mail_aws.MailSetupError as e:
        raise MailError(str(e)) from e
    d = InboxDomain(organization_id=org_id, sending_domain_id=sd.id, receive_domain=receive, status="pending",
                    mx_value=mail_aws.mx_value(cfg["region"]),
                    status_note="Add the MX record below at your DNS provider, then press Verify.")
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


def _mx_lookup(domain: str) -> tuple[list[str], str]:
    """(mx hosts, state) — state: ok | none (no MX) | nxdomain"""
    import dns.resolver

    try:
        answers = eds._resolve(domain, "MX")
        return sorted({str(r.exchange).rstrip(".").lower() for r in answers}), "ok"
    except dns.resolver.NXDOMAIN:
        return [], "nxdomain"
    except Exception:  # noqa: BLE001
        return [], "none"


async def verify_inbox_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID) -> InboxDomain:
    d = await _get_domain(db, org_id, domain_id)
    if d.status == "disabled":
        raise MailError("This inbox is turned off. Turn it on first.")
    hosts, state = await asyncio.to_thread(_mx_lookup, d.receive_domain)
    target = d.mx_value.split()[-1].lower()
    now = _now()
    d.last_checked_at = now
    d.dns_submitted_at = d.dns_submitted_at or now
    if target in hosts:
        d.status, d.status_note = "active", f"MX found. Mail sent to anything@{d.receive_domain} now arrives in your inbox."
    else:
        d.status = "pending"
        if hosts:
            d.status_note = (f"{d.receive_domain} already receives email at {', '.join(hosts)}. Adding our MX would take that mail away — "
                             f"use a subdomain such as mail.{d.receive_domain.split('.', 1)[-1] if d.receive_domain.count('.') > 1 else d.receive_domain} instead, "
                             "or remove the old MX only if you want to move all mail here.")
        elif state == "nxdomain":
            d.status_note = f"{d.receive_domain} doesn't exist in public DNS yet. Check the spelling, and that the domain's nameservers point to the DNS provider where you add records."
        else:
            d.status_note = "The MX record isn't visible yet. DNS usually updates in minutes, sometimes up to a few hours."
    await db.commit()
    await db.refresh(d)
    return d


async def auto_verify_inbox_pending(db: AsyncSession) -> dict:
    cutoff = _now() - timedelta(hours=72)
    rows = list(await db.scalars(select(InboxDomain).where(InboxDomain.status == "pending", InboxDomain.dns_submitted_at.isnot(None), InboxDomain.dns_submitted_at >= cutoff)))
    ok = 0
    for d in rows:
        try:
            ok += (await verify_inbox_domain(db, d.organization_id, d.id)).status == "active"
        except Exception:  # noqa: BLE001
            await db.rollback()
    return {"checked": len(rows), "activated": ok}


async def set_inbox_enabled(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID, enabled: bool) -> InboxDomain:
    d = await _get_domain(db, org_id, domain_id)
    cfg = await get_ses_config(db)
    if cfg is None:
        raise MailError("Amazon SES isn't connected on this platform.")
    if enabled:
        try:
            await mail_aws.ensure_rule(cfg, d.receive_domain)
        except mail_aws.MailSetupError as e:
            raise MailError(str(e)) from e
        d.status = "pending"
        await db.commit()
        return await verify_inbox_domain(db, org_id, domain_id)
    await mail_aws.remove_rule(cfg, d.receive_domain)
    d.status, d.status_note = "disabled", "Turned off. New mail is no longer received; existing mail is kept."
    await db.commit()
    await db.refresh(d)
    return d


async def set_catch_all(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID, value: bool) -> InboxDomain:
    d = await _get_domain(db, org_id, domain_id)
    d.catch_all = value
    await db.commit()
    await db.refresh(d)
    return d


async def list_addresses(db: AsyncSession, org_id: uuid.UUID) -> list[InboxAddress]:
    return list(await db.scalars(select(InboxAddress).where(InboxAddress.organization_id == org_id).order_by(InboxAddress.created_at)))


async def add_address(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID, local_part: str, display_name: str | None) -> InboxAddress:
    d = await _get_domain(db, org_id, domain_id)
    lp = local_part.strip().lower()
    if not LOCAL_RE.match(lp):
        raise MailError("Use letters, numbers, dots, dashes or underscores (for example support).")
    if await db.scalar(select(InboxAddress.id).where(InboxAddress.inbox_domain_id == d.id, InboxAddress.local_part == lp)):
        raise MailError(f"{lp}@{d.receive_domain} already exists.")
    first = await db.scalar(select(InboxAddress.id).where(InboxAddress.organization_id == org_id).limit(1)) is None
    a = InboxAddress(organization_id=org_id, inbox_domain_id=d.id, local_part=lp, display_name=(display_name or "").strip() or lp.title(), is_default=first)
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a


async def update_address(
    db: AsyncSession, org_id: uuid.UUID, address_id: uuid.UUID, *, display_name: str | None, make_default: bool,
    local_part: str | None = None, inbox_domain_id: uuid.UUID | None = None,
) -> InboxAddress:
    a = await db.scalar(select(InboxAddress).where(InboxAddress.organization_id == org_id, InboxAddress.id == address_id))
    if a is None:
        raise NotFound(address_id)
    if display_name is not None:
        a.display_name = display_name.strip() or a.local_part.title()
    if local_part is not None or inbox_domain_id is not None:
        lp = (local_part if local_part is not None else a.local_part).strip().lower()
        if not LOCAL_RE.match(lp):
            raise MailError("Use letters, numbers, dots, dashes or underscores (for example support).")
        d = await _get_domain(db, org_id, inbox_domain_id or a.inbox_domain_id)
        clash = await db.scalar(select(InboxAddress.id).where(
            InboxAddress.inbox_domain_id == d.id, InboxAddress.local_part == lp, InboxAddress.id != a.id))
        if clash:
            raise MailError(f"{lp}@{d.receive_domain} already exists.")
        a.local_part, a.inbox_domain_id = lp, d.id
    if make_default:
        for other in await list_addresses(db, org_id):
            other.is_default = other.id == a.id
    await db.commit()
    await db.refresh(a)
    return a


async def delete_address(db: AsyncSession, org_id: uuid.UUID, address_id: uuid.UUID) -> None:
    a = await db.scalar(select(InboxAddress).where(InboxAddress.organization_id == org_id, InboxAddress.id == address_id))
    if a is None:
        raise NotFound(address_id)
    was_default = a.is_default
    await db.delete(a)
    await db.flush()
    if was_default:
        rest = await list_addresses(db, org_id)
        if rest:
            rest[0].is_default = True
    await db.commit()


async def full_address(db: AsyncSession, a: InboxAddress) -> str:
    d = await db.get(InboxDomain, a.inbox_domain_id)
    return f"{a.local_part}@{d.receive_domain}"


# ── receiving ────────────────────────────────────────────────────────────────

async def _route(db: AsyncSession, recipients: list[str]) -> dict[uuid.UUID, InboxAddress]:
    """Which customer (and which of their addresses) does this mail belong to? One copy per customer."""
    found: dict[uuid.UUID, InboxAddress] = {}
    for rcpt in dict.fromkeys(r.strip().lower() for r in recipients if r and "@" in r):
        local, _, domain = rcpt.rpartition("@")
        d = await db.scalar(select(InboxDomain).where(InboxDomain.receive_domain == domain, InboxDomain.status != "disabled"))
        if d is None or d.organization_id in found:
            continue
        base = local.split("+", 1)[0]
        a = await db.scalar(select(InboxAddress).where(InboxAddress.inbox_domain_id == d.id, InboxAddress.local_part == base))
        if a is None and d.catch_all:
            a = await db.scalar(select(InboxAddress).where(InboxAddress.inbox_domain_id == d.id).order_by(InboxAddress.is_default.desc(), InboxAddress.created_at).limit(1))
        if a is not None:
            found[d.organization_id] = a
    return found


def _merge_participants(existing: list, new: list[dict]) -> list:
    seen = {p["email"] for p in existing}
    return existing + [p for p in new if p["email"] and p["email"] not in seen][:50 - len(existing)]


async def ingest_raw_email(db: AsyncSession, raw: bytes, *, verdicts: dict | None = None, recipients: list[str] | None = None,
                           raw_key: str | None = None) -> list[MailMessage]:
    """File one received email for every customer it was addressed to. Safe to call twice with the same email."""
    p = parse_email(raw)
    targets = await _route(db, recipients or p["header_recipients"])
    if not targets:
        log.info("mail: no inbox matches recipients %s", recipients or p["header_recipients"])
        return []
    v = {k: ((verdicts or {}).get(k) or None) for k in ("spam", "virus", "spf", "dkim", "dmarc")}
    created: list[MailMessage] = []
    for org_id, address in targets.items():
        if p["message_id"] and await db.scalar(select(MailMessage.id).where(MailMessage.organization_id == org_id, MailMessage.message_id_header == p["message_id"])):
            continue
        thread = None
        for ref in ([p["in_reply_to"]] if p["in_reply_to"] else []) + list(reversed(p["references"])):
            thread = await db.scalar(select(MailThread).join(MailMessage, MailMessage.thread_id == MailThread.id)
                                     .where(MailThread.organization_id == org_id, MailMessage.message_id_header == ref).limit(1))
            if thread:
                break
        bad = v["spam"] == "FAIL" or v["virus"] == "FAIL"
        now = _now()
        sender = [{"email": p["from_email"], "name": p["from_name"] or ""}]
        if thread is None:
            thread = MailThread(organization_id=org_id, address_id=address.id, subject=p["subject"] or "(no subject)", folder="spam" if bad else "inbox",
                                participants=sender, last_message_at=now, message_count=0, unread_count=0)
            db.add(thread)
            await db.flush()
        elif thread.folder in ("archive", "trash", "sent") and not bad:
            thread.folder, thread.trashed_at = "inbox", None
        text, html = p["text"], p["html"]
        msg = MailMessage(
            organization_id=org_id, thread_id=thread.id, direction="in", message_id_header=p["message_id"], in_reply_to=p["in_reply_to"],
            references_hdr=" ".join(p["references"]) or None, from_email=p["from_email"], from_name=p["from_name"], to_json=p["to"], cc_json=p["cc"],
            subject=p["subject"], text_enc=seal(text), html_enc=seal(html) if html else None, snippet_enc=seal(_snippet(text)), sent_at=p["sent_at"],
            received_at=now, raw_key=raw_key, spam_verdict=v["spam"], virus_verdict=v["virus"], spf_verdict=v["spf"], dkim_verdict=v["dkim"],
            dmarc_verdict=v["dmarc"], auto_generated=p["auto_generated"], is_read=False, status="received")
        db.add(msg)
        await db.flush()
        for a in p["attachments"]:
            db.add(MailAttachment(message_id=msg.id, idx=a["idx"], filename=a["filename"], content_type=a["content_type"], size=a["size"]))
        thread.message_count += 1
        thread.unread_count += 1
        thread.last_message_at = now
        thread.snippet_enc = msg.snippet_enc
        thread.participants = _merge_participants(list(thread.participants or []), sender)
        if thread.contact_id is None and p["from_email"]:
            thread.contact_id = await db.scalar(select(Contact.id).where(Contact.organization_id == org_id, func.lower(Contact.email) == p["from_email"], Contact.deleted_at.is_(None)).limit(1))
        created.append(msg)
    await db.commit()
    return created


async def process_notification(db: AsyncSession, note: dict) -> int:
    """An SES 'Received' notification (delivered through SNS): download the email from S3 and file it."""
    receipt, mail = note.get("receipt") or {}, note.get("mail") or {}
    action = receipt.get("action") or {}
    bucket, key = action.get("bucketName"), action.get("objectKey")
    if not (bucket and key):
        log.warning("mail: notification without an S3 location, ignored")
        return 0
    cfg = await get_ses_config(db)
    if cfg is None:
        raise MailError("Amazon SES isn't connected.")
    raw = await mail_aws.fetch_raw(cfg, bucket, key)
    verdict = lambda k: (receipt.get(k) or {}).get("status")  # noqa: E731
    made = await ingest_raw_email(db, raw, recipients=receipt.get("recipients") or mail.get("destination") or [], raw_key=key,
                                  verdicts={"spam": verdict("spamVerdict"), "virus": verdict("virusVerdict"), "spf": verdict("spfVerdict"),
                                            "dkim": verdict("dkimVerdict"), "dmarc": verdict("dmarcVerdict")})
    return len(made)


# ── reading ──────────────────────────────────────────────────────────────────

def thread_row(t: MailThread, addr: str | None = None) -> dict:
    return {"id": t.id, "subject": t.subject, "snippet": unseal(t.snippet_enc), "folder": t.folder, "starred": t.starred,
            "unread_count": t.unread_count, "message_count": t.message_count, "has_outgoing": t.has_outgoing,
            "participants": t.participants or [], "contact_id": t.contact_id, "assigned_to_user_id": t.assigned_to_user_id,
            "last_message_at": t.last_message_at, "address_id": t.address_id, "address": addr}


async def list_threads(db: AsyncSession, org_id: uuid.UUID, *, folder: str = "inbox", q: str | None = None, unread_only: bool = False,
                       assigned: str | None = None, limit: int = 30, offset: int = 0, user_id: uuid.UUID | None = None) -> list[dict]:
    stmt = select(MailThread).where(MailThread.organization_id == org_id)
    if folder == "sent":
        stmt = stmt.where(MailThread.has_outgoing.is_(True), MailThread.folder.notin_(("trash", "spam")))
    elif folder == "starred":
        stmt = stmt.where(MailThread.starred.is_(True), MailThread.folder != "trash")
    elif folder in FOLDERS:
        stmt = stmt.where(MailThread.folder == folder)
    else:
        raise MailError("Unknown folder.")
    if unread_only:
        stmt = stmt.where(MailThread.unread_count > 0)
    if assigned == "me" and user_id:
        stmt = stmt.where(MailThread.assigned_to_user_id == user_id)
    elif assigned == "none":
        stmt = stmt.where(MailThread.assigned_to_user_id.is_(None))
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(MailThread.subject.ilike(like), cast(MailThread.participants, String).ilike(like)))
    rows = list(await db.scalars(stmt.order_by(MailThread.last_message_at.desc()).limit(min(limit, 100)).offset(offset)))
    addr_ids = {t.address_id for t in rows if t.address_id}
    addr_map: dict[uuid.UUID, str] = {}
    for a in (await db.scalars(select(InboxAddress).where(InboxAddress.id.in_(addr_ids)))).all() if addr_ids else []:
        addr_map[a.id] = await full_address(db, a)
    return [thread_row(t, addr_map.get(t.address_id)) for t in rows]


async def counts(db: AsyncSession, org_id: uuid.UUID) -> dict:
    rows = (await db.execute(select(MailThread.folder, func.count(), func.sum(case((MailThread.unread_count > 0, 1), else_=0)))
                             .where(MailThread.organization_id == org_id).group_by(MailThread.folder))).all()
    by = {f: {"threads": n, "unread": int(u or 0)} for f, n, u in rows}
    sent = await db.scalar(select(func.count()).where(MailThread.organization_id == org_id, MailThread.has_outgoing.is_(True), MailThread.folder.notin_(("trash", "spam")))) or 0
    starred = await db.scalar(select(func.count()).where(MailThread.organization_id == org_id, MailThread.starred.is_(True), MailThread.folder != "trash")) or 0
    return {"inbox_unread": by.get("inbox", {}).get("unread", 0), "spam_unread": by.get("spam", {}).get("unread", 0),
            "folders": {**{f: by.get(f, {}).get("threads", 0) for f in FOLDERS}, "sent": sent, "starred": starred}}


async def _thread(db: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID) -> MailThread:
    t = await db.scalar(select(MailThread).where(MailThread.organization_id == org_id, MailThread.id == thread_id))
    if t is None:
        raise NotFound(thread_id)
    return t


async def thread_detail(db: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID, *, images: bool = False) -> dict:
    t = await _thread(db, org_id, thread_id)
    msgs = list(await db.scalars(select(MailMessage).where(MailMessage.thread_id == t.id).order_by(MailMessage.sent_at, MailMessage.received_at)))
    atts: dict[uuid.UUID, list] = {}
    for a in (await db.scalars(select(MailAttachment).where(MailAttachment.message_id.in_([m.id for m in msgs])).order_by(MailAttachment.idx))).all() if msgs else []:
        atts.setdefault(a.message_id, []).append({"idx": a.idx, "filename": a.filename, "content_type": a.content_type, "size": a.size})
    out = []
    for m in msgs:
        html = unseal(m.html_enc) if m.html_enc else ""
        out.append({
            "id": m.id, "direction": m.direction, "from_email": m.from_email, "from_name": m.from_name, "to": m.to_json, "cc": m.cc_json,
            "subject": m.subject, "sent_at": m.sent_at, "text": unseal(m.text_enc),
            "html": sanitize_html(html, allow_images=images) if html else None, "has_images": bool(html and re.search(r"<img\b", html, re.I)),
            "attachments": atts.get(m.id, []), "spam": m.spam_verdict, "virus": m.virus_verdict, "spf": m.spf_verdict, "dkim": m.dkim_verdict,
            "dmarc": m.dmarc_verdict, "auto_generated": m.auto_generated, "status": m.status, "error": m.error, "message_id": m.message_id_header,
        })
    addr = await db.get(InboxAddress, t.address_id) if t.address_id else None
    contact = await db.get(Contact, t.contact_id) if t.contact_id else None
    return {**thread_row(t, await full_address(db, addr) if addr else None), "messages": out,
            "contact": {"id": contact.id, "first_name": contact.first_name, "last_name": contact.last_name, "email": contact.email} if contact else None}


async def mark_read(db: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID, read: bool = True) -> None:
    t = await _thread(db, org_id, thread_id)
    if read:
        for m in await db.scalars(select(MailMessage).where(MailMessage.thread_id == t.id, MailMessage.is_read.is_(False))):
            m.is_read = True
        t.unread_count = 0
    elif t.unread_count == 0:
        t.unread_count = 1
    await db.commit()


async def update_thread(db: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID, *, folder: str | None = None, starred: bool | None = None) -> MailThread:
    t = await _thread(db, org_id, thread_id)
    if folder is not None:
        if folder not in FOLDERS:
            raise MailError("Unknown folder.")
        t.folder = folder
        t.trashed_at = _now() if folder == "trash" else None
    if starred is not None:
        t.starred = starred
    await db.commit()
    await db.refresh(t)
    return t


async def assign_thread(db: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID, user_id: uuid.UUID | None) -> MailThread:
    t = await _thread(db, org_id, thread_id)
    if user_id and not await db.scalar(select(OrganizationMember.id).where(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)):
        raise MailError("That person isn't on your team.")
    t.assigned_to_user_id = user_id
    await db.commit()
    await db.refresh(t)
    return t


async def contact_from_thread(db: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID, user_id: uuid.UUID) -> Contact:
    from app.services import audience_service  # noqa: PLC0415

    t = await _thread(db, org_id, thread_id)
    if t.contact_id:
        return await db.get(Contact, t.contact_id)
    first = await db.scalar(select(MailMessage).where(MailMessage.thread_id == t.id, MailMessage.direction == "in").order_by(MailMessage.sent_at).limit(1))
    if first is None or not first.from_email:
        raise MailError("This conversation has no sender to save.")
    parts = (first.from_name or "").split(None, 1)
    c = await audience_service.create_contact(db, org_id, email=first.from_email, first_name=parts[0] if parts else None,
                                              last_name=parts[1] if len(parts) > 1 else None, tags=["email-inbox"], changed_by_user_id=user_id)
    t.contact_id = c.id
    await db.commit()
    return c


async def attachment_bytes(db: AsyncSession, org_id: uuid.UUID, message_id: uuid.UUID, idx: int) -> tuple[bytes, str, str]:
    m = await db.scalar(select(MailMessage).where(MailMessage.organization_id == org_id, MailMessage.id == message_id))
    if m is None:
        raise NotFound(message_id)
    a = await db.scalar(select(MailAttachment).where(MailAttachment.message_id == m.id, MailAttachment.idx == idx))
    if a is None:
        raise NotFound(idx)
    if m.virus_verdict == "FAIL":
        raise MailError("This file was blocked: the virus scan flagged this email.")
    if m.direction == "out":
        data = await db.scalar(select(MailAttachment.data).where(MailAttachment.id == a.id))
        return data or b"", a.filename, a.content_type
    cfg = await get_ses_config(db)
    if cfg is None or not m.raw_key or not cfg.get("inbound_bucket"):
        raise MailError("The original email is no longer stored (past the retention period).")
    raw = await mail_aws.fetch_raw(cfg, cfg["inbound_bucket"], m.raw_key)
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    for i, part in enumerate(msg.iter_attachments()):
        if i == idx:
            return part.get_payload(decode=True) or b"", a.filename, a.content_type
    raise NotFound(idx)


# ── uploads and sending ──────────────────────────────────────────────────────

async def save_upload(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, filename: str, content_type: str, data: bytes) -> MailUpload:
    limit = settings.mail_max_attachment_mb * 1024 * 1024
    if not data:
        raise MailError("That file is empty.")
    if len(data) > limit:
        raise MailError(f"Files can be at most {settings.mail_max_attachment_mb} MB.")
    if re.search(r"\.(exe|bat|cmd|com|scr|js|vbs|msi|jar|ps1)$", filename, re.I):
        raise MailError("This file type can't be attached for safety reasons.")
    u = MailUpload(organization_id=org_id, user_id=user_id, filename=filename[:300], content_type=content_type or "application/octet-stream", size=len(data), data=data)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


def _clean_list(values: list[str]) -> list[str]:
    out = []
    for v in values:
        v = (v or "").strip().lower()
        if v and v not in out:
            if not EMAIL_RE.match(v):
                raise MailError(f"'{v}' isn't a valid email address.")
            out.append(v)
    return out


async def send_mail(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, *, address_id: uuid.UUID, to: list[str], cc: list[str], subject: str,
                    text: str, html: str | None = None, thread_id: uuid.UUID | None = None, upload_ids: list[uuid.UUID] | None = None) -> MailMessage:
    to, cc = _clean_list(to), _clean_list(cc)
    if not to:
        raise MailError("Add at least one recipient.")
    if len(to) + len(cc) > MAX_RECIPIENTS:
        raise MailError(f"At most {MAX_RECIPIENTS} recipients per message.")
    if not text.strip():
        raise MailError("Write a message first.")
    address = await db.scalar(select(InboxAddress).where(InboxAddress.organization_id == org_id, InboxAddress.id == address_id))
    if address is None:
        raise NotFound(address_id)
    domain = await db.get(InboxDomain, address.inbox_domain_id)
    if domain.status == "disabled":
        raise MailError("This inbox is turned off.")
    cfg = await get_ses_config(db)
    if cfg is None:
        raise MailError("Amazon SES isn't connected on this platform, so mail can't be sent.")
    today = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    sent_today = await db.scalar(select(func.count(MailMessage.id)).where(MailMessage.organization_id == org_id, MailMessage.direction == "out", MailMessage.sent_at >= today)) or 0
    if sent_today >= settings.mail_daily_send_cap_per_org:
        raise MailError(f"Daily limit reached ({settings.mail_daily_send_cap_per_org} messages). Try again tomorrow.")
    suppressed = await email_event_service.suppressed_emails(db, org_id)
    blocked = [r for r in to + cc if r in suppressed]
    if blocked:
        raise MailError(f"{', '.join(blocked)} bounced or reported spam earlier, so we won't send to it.")

    thread = await _thread(db, org_id, thread_id) if thread_id else None
    from_email = f"{address.local_part}@{domain.receive_domain}"
    last = await db.scalar(select(MailMessage).where(MailMessage.thread_id == thread.id, MailMessage.message_id_header.isnot(None)).order_by(MailMessage.sent_at.desc(), MailMessage.received_at.desc()).limit(1)) if thread else None
    uploads = list(await db.scalars(select(MailUpload).options(undefer(MailUpload.data)).where(MailUpload.organization_id == org_id, MailUpload.id.in_(upload_ids)))) if upload_ids else []
    if sum(u.size for u in uploads) > settings.mail_max_attachment_mb * 1024 * 1024:
        raise MailError(f"Attachments can total at most {settings.mail_max_attachment_mb} MB.")

    subj = subject.strip()[:500] or "(no subject)"
    mime = EmailMessage(policy=policy.SMTP)
    mime["From"], mime["To"], mime["Subject"], mime["Date"] = formataddr((address.display_name or "", from_email)), ", ".join(to), subj, formatdate(localtime=False)
    if cc:
        mime["Cc"] = ", ".join(cc)
    my_id = make_msgid(domain=domain.receive_domain)
    mime["Message-ID"] = my_id
    if last and last.message_id_header:
        mime["In-Reply-To"] = f"<{last.message_id_header}>"
        mime["References"] = " ".join(f"<{r}>" for r in (((last.references_hdr or "").split()) + [last.message_id_header])[-20:])
    mime.set_content(text)
    if html:
        mime.add_alternative(html, subtype="html")
    for u in uploads:
        maintype, _, subtype = (u.content_type or "application/octet-stream").partition("/")
        mime.add_attachment(u.data, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=u.filename)

    now = _now()
    error = None
    try:
        await mail_aws.send_raw(cfg, mime.as_bytes(), from_email=from_email, recipients=to + cc)
    except EmailSendError as e:
        error = str(e)
    if thread is None:
        thread = MailThread(organization_id=org_id, address_id=address.id, subject=subj, folder="sent", participants=[{"email": r, "name": ""} for r in to + cc], last_message_at=now)
        db.add(thread)
        await db.flush()
    elif thread.folder == "trash":
        thread.folder, thread.trashed_at = "inbox", None
    msg = MailMessage(organization_id=org_id, thread_id=thread.id, direction="out", message_id_header=_mid(my_id), in_reply_to=_mid(last.message_id_header) if last else None,
                      references_hdr=mime.get("References"), from_email=from_email, from_name=address.display_name,
                      to_json=[{"email": r, "name": ""} for r in to], cc_json=[{"email": r, "name": ""} for r in cc], subject=subj, text_enc=seal(text),
                      html_enc=seal(html) if html else None, snippet_enc=seal(_snippet(text)), sent_at=now, received_at=now, is_read=True,
                      status="failed" if error else "sent", error=error, sent_by_user_id=user_id)
    db.add(msg)
    await db.flush()
    for i, u in enumerate(uploads):
        db.add(MailAttachment(message_id=msg.id, idx=i, filename=u.filename, content_type=u.content_type, size=u.size, data=u.data))
    thread.message_count += 1
    thread.has_outgoing = True
    thread.last_message_at, thread.snippet_enc = now, msg.snippet_enc
    thread.participants = _merge_participants(list(thread.participants or []), [{"email": r, "name": ""} for r in to + cc])
    for u in uploads:
        await db.delete(u)
    await db.commit()
    if error:
        raise MailError(error)
    await db.refresh(msg)
    return msg


# ── housekeeping ─────────────────────────────────────────────────────────────

async def purge_old(db: AsyncSession) -> dict:
    """Retention: delete old mail (and its stored raw copy), empty threads, old trash and unused uploads."""
    cfg = await get_ses_config(db)
    cutoff = _now() - timedelta(days=settings.mail_retention_days)
    old = list(await db.scalars(select(MailMessage).where(MailMessage.received_at < cutoff).limit(2000)))
    for m in old:
        if m.raw_key and cfg and cfg.get("inbound_bucket"):
            await mail_aws.delete_raw(cfg, cfg["inbound_bucket"], m.raw_key)
        await db.delete(m)
    await db.flush()
    trash_cut = _now() - timedelta(days=30)
    trashed = list(await db.scalars(select(MailThread).where(MailThread.folder == "trash", MailThread.trashed_at < trash_cut)))
    for t in trashed:
        for m in await db.scalars(select(MailMessage).where(MailMessage.thread_id == t.id)):
            if m.raw_key and cfg and cfg.get("inbound_bucket"):
                await mail_aws.delete_raw(cfg, cfg["inbound_bucket"], m.raw_key)
        await db.delete(t)
    empty = list(await db.scalars(select(MailThread).where(~select(MailMessage.id).where(MailMessage.thread_id == MailThread.id).exists())))
    for t in empty:
        await db.delete(t)
    uploads = list(await db.scalars(select(MailUpload).where(MailUpload.created_at < _now() - timedelta(days=1))))
    for u in uploads:
        await db.delete(u)
    await db.commit()
    return {"messages": len(old), "trashed_threads": len(trashed), "empty_threads": len(empty), "uploads": len(uploads)}
