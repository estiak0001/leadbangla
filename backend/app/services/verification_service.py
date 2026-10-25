import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.verification import VerificationDocument, VerificationRequest
from app.services import notification_service
from app.services.phone import normalize_bd_msisdn

log = logging.getLogger(__name__)

KINDS = ("sms_sender_id", "whatsapp_number")
OPEN_STATUSES = ("pending", "needs_info", "submitted")
MAX_DOC_BYTES = 5 * 1024 * 1024
ALLOWED_TYPES = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/pjpeg": "jpg"}

# What each request needs. `required` documents must be present before approval.
DOC_REQUIREMENTS: dict[str, list[dict]] = {
    "sms_sender_id": [
        {"type": "nid", "label": "National ID (NID)", "required": True,
         "hint": "Clear copy of the owner's or authorised representative's valid NID (front and back)"},
        {"type": "trade_license", "label": "Trade License", "required": False, "group": "business",
         "hint": "A valid trade license confirming the business is registered"},
        {"type": "institutional_authorization", "label": "Institutional authorization letter", "required": False, "group": "business",
         "hint": "For schools, colleges, universities and institutes — signed by the head of the institution and stamped with the official seal. Use this instead of a trade license."},
        {"type": "application_form", "label": "Official application form", "required": True,
         "hint": "Written on your organisation's letterhead (pad), with the organisation's seal and an authorised signature"},
        {"type": "other", "label": "Other supporting document", "required": False, "hint": "Brand or trademark proof, anything else that helps"},
    ],
    "whatsapp_number": [
        {"type": "trade_license", "label": "Trade License", "required": True, "hint": "Current trade license of the business"},
        {"type": "tin_certificate", "label": "TIN Certificate", "required": True, "hint": "Business TIN"},
        {"type": "business_proof", "label": "Business proof", "required": False, "hint": "Website or Facebook page screenshot showing the business name"},
        {"type": "other", "label": "Other supporting document", "required": False, "hint": "Anything else Meta or our team may ask for"},
    ],
}


# "At least one of these documents" groups: group key -> label shown to people.
GROUP_LABELS = {"business": "Trade License or Institutional authorization letter"}


class VerificationError(Exception):
    """User-facing problem (bad input / wrong state)."""


class VerificationNotFoundError(Exception):
    pass


def _types(kind: str) -> set[str]:
    return {d["type"] for d in DOC_REQUIREMENTS[kind]}


async def documents_for(db: AsyncSession, request_id: uuid.UUID) -> list[VerificationDocument]:
    # `data` is deferred, so listing never loads file bytes.
    return list(await db.scalars(
        select(VerificationDocument).where(VerificationDocument.request_id == request_id).order_by(VerificationDocument.created_at)
    ))


async def missing_required(db: AsyncSession, req: VerificationRequest) -> list[str]:
    """Missing required document types, plus the key of any "one of" group with nothing uploaded."""
    have = {d.doc_type for d in await documents_for(db, req.id)}
    reqs = DOC_REQUIREMENTS[req.kind]
    missing = [d["type"] for d in reqs if d["required"] and d["type"] not in have]
    for group in dict.fromkeys(d["group"] for d in reqs if d.get("group")):
        if not any(d["type"] in have for d in reqs if d.get("group") == group):
            missing.append(group)
    return missing


def missing_labels(kind: str, missing: list[str]) -> str:
    labels = {d["type"]: d["label"] for d in DOC_REQUIREMENTS[kind]}
    return ", ".join(GROUP_LABELS.get(m) or labels.get(m, m) for m in missing)


async def list_requests(db: AsyncSession, org_id: uuid.UUID, kind: str | None = None) -> list[VerificationRequest]:
    q = select(VerificationRequest).where(VerificationRequest.organization_id == org_id).order_by(VerificationRequest.created_at.desc())
    if kind:
        q = q.where(VerificationRequest.kind == kind)
    return list(await db.scalars(q))


async def get_request(db: AsyncSession, request_id: uuid.UUID, org_id: uuid.UUID | None = None) -> VerificationRequest:
    q = select(VerificationRequest).where(VerificationRequest.id == request_id)
    if org_id is not None:
        q = q.where(VerificationRequest.organization_id == org_id)
    req = await db.scalar(q)
    if req is None:
        raise VerificationNotFoundError(request_id)
    return req


async def _cancel_open(db: AsyncSession, org_id: uuid.UUID, kind: str) -> None:
    for r in await db.scalars(select(VerificationRequest).where(
        VerificationRequest.organization_id == org_id, VerificationRequest.kind == kind,
        VerificationRequest.status.in_(OPEN_STATUSES),
    )):
        r.status = "cancelled"


async def create_request(db: AsyncSession, org_id: uuid.UUID, kind: str, value: str, note: str | None) -> VerificationRequest:
    if kind not in KINDS:
        raise VerificationError("Unknown request type")
    value = value.strip()
    if not value:
        raise VerificationError("Enter a value to verify")
    if kind == "whatsapp_number":
        try:
            value = "+" + normalize_bd_msisdn(value)
        except ValueError as e:
            raise VerificationError(str(e)) from e
        org = await db.get(Organization, org_id)
        org.whatsapp_number = value
        org.whatsapp_number_approved = False
    await _cancel_open(db, org_id, kind)
    req = VerificationRequest(organization_id=org_id, kind=kind, value=value, customer_note=(note or None))
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req


async def sync_sender_request(db: AsyncSession, org_id: uuid.UUID, sender_id: str | None, note: str | None = None) -> VerificationRequest | None:
    """Called after the org's Sender ID changed (fee already handled by
    update_org_sms_sender_id): keep exactly one open request that matches it."""
    if not sender_id:
        await _cancel_open(db, org_id, "sms_sender_id")
        await db.commit()
        return None
    existing = await db.scalar(select(VerificationRequest).where(
        VerificationRequest.organization_id == org_id, VerificationRequest.kind == "sms_sender_id",
        VerificationRequest.status.in_(OPEN_STATUSES), VerificationRequest.value == sender_id,
    ))
    if existing:
        return existing
    return await create_request(db, org_id, "sms_sender_id", sender_id, note)


async def add_document(db: AsyncSession, org_id: uuid.UUID, request_id: uuid.UUID, doc_type: str, filename: str, content_type: str, data: bytes) -> VerificationDocument:
    req = await get_request(db, request_id, org_id)
    if req.status not in OPEN_STATUSES:
        raise VerificationError("This request is closed — start a new request to upload more documents.")
    if doc_type not in _types(req.kind):
        raise VerificationError("Unknown document type")
    if content_type not in ALLOWED_TYPES:
        raise VerificationError("Upload a PDF, PNG or JPG file.")
    if not data:
        raise VerificationError("The file is empty.")
    if len(data) > MAX_DOC_BYTES:
        raise VerificationError("File is too large (max 5 MB).")
    if doc_type != "other":  # one file per required type: a new upload replaces the old one
        for old in await db.scalars(select(VerificationDocument).where(
            VerificationDocument.request_id == req.id, VerificationDocument.doc_type == doc_type
        )):
            await db.delete(old)
    doc = VerificationDocument(
        request_id=req.id, organization_id=org_id, doc_type=doc_type,
        filename=(filename or "document")[:255], content_type=content_type, size=len(data), data=data,
    )
    db.add(doc)
    if req.status == "needs_info":  # customer answered the admin's request
        req.status = "pending"
    await db.commit()
    await db.refresh(doc)
    return doc


async def get_document(db: AsyncSession, request_id: uuid.UUID, doc_id: uuid.UUID, org_id: uuid.UUID | None) -> VerificationDocument:
    q = select(VerificationDocument).where(VerificationDocument.id == doc_id, VerificationDocument.request_id == request_id)
    if org_id is not None:
        q = q.where(VerificationDocument.organization_id == org_id)
    doc = await db.scalar(q)
    if doc is None:
        raise VerificationNotFoundError(doc_id)
    await db.refresh(doc, attribute_names=["data"])
    return doc


async def delete_document(db: AsyncSession, org_id: uuid.UUID, request_id: uuid.UUID, doc_id: uuid.UUID) -> None:
    req = await get_request(db, request_id, org_id)
    if req.status not in OPEN_STATUSES:
        raise VerificationError("This request is closed.")
    doc = await get_document(db, request_id, doc_id, org_id)
    await db.delete(doc)
    await db.commit()


async def cancel_request(db: AsyncSession, org_id: uuid.UUID, request_id: uuid.UUID) -> VerificationRequest:
    req = await get_request(db, request_id, org_id)
    if req.status not in OPEN_STATUSES:
        raise VerificationError("Only open requests can be cancelled.")
    req.status = "cancelled"
    await db.commit()
    await db.refresh(req)
    return req


# ── Admin ────────────────────────────────────────────────────────────────────

async def admin_list(db: AsyncSession, status: str | None, kind: str | None) -> list[tuple[VerificationRequest, str]]:
    q = (select(VerificationRequest, Organization.name)
         .join(Organization, Organization.id == VerificationRequest.organization_id)
         .order_by(VerificationRequest.created_at.desc()))
    if status:
        q = q.where(VerificationRequest.status == status)
    if kind:
        q = q.where(VerificationRequest.kind == kind)
    return [(r, name) for r, name in (await db.execute(q)).all()]


async def open_count(db: AsyncSession) -> int:
    return await db.scalar(select(func.count(VerificationRequest.id)).where(VerificationRequest.status == "pending")) or 0


async def decide(db: AsyncSession, request_id: uuid.UUID, decision: str, note: str | None, admin_email: str, final_value: str | None = None, gateway_ref: str | None = None, skip_documents: bool = False) -> VerificationRequest:
    if decision not in ("approved", "rejected", "needs_info", "submitted", "revoked"):
        raise VerificationError("Unknown decision")
    req = await get_request(db, request_id)
    revoking = decision == "revoked"
    if revoking:
        if req.status != "approved":
            raise VerificationError("Only an approved request can be revoked.")
        decision = "rejected"
    elif req.status not in OPEN_STATUSES:
        raise VerificationError("This request was already closed.")
    note = (note or "").strip() or None
    if revoking and note:
        note = f"Approval revoked: {note}"
    if (decision in ("rejected", "needs_info") or revoking) and not note:
        raise VerificationError("Add a note so the customer knows what to fix.")
    org = await db.get(Organization, req.organization_id)

    skipped = False
    if decision == "submitted":
        missing = await missing_required(db, req)
        skipped = skipped or bool(missing and skip_documents)
        if missing and not skip_documents:
            raise VerificationError("Required documents are missing: " + missing_labels(req.kind, missing))
        req.gateway_ref = (gateway_ref or "").strip() or None
        req.submitted_at = datetime.now(timezone.utc)

    if decision == "approved":
        missing = await missing_required(db, req)
        skipped = skipped or bool(missing and skip_documents)
        if missing and not skip_documents:
            raise VerificationError("Required documents are missing: " + missing_labels(req.kind, missing))
        if req.kind == "sms_sender_id":
            value = (final_value or req.value).strip()
            org.sms_sender_id, org.sms_sender_id_approved = value, True
            req.value = value
        else:
            org.whatsapp_number, org.whatsapp_number_approved = req.value, True
    elif decision == "rejected":
        if req.kind == "sms_sender_id":
            org.sms_sender_id_approved = False
        else:
            org.whatsapp_number_approved = False

    if skipped:    # an admin may vouch for a customer without uploaded papers; keep a trail of it
        trail = f"[{decision} by {admin_email} without documents]"
        note = f"{note}\n{trail}" if note else trail
    req.status, req.admin_note = decision, note
    req.reviewed_by, req.reviewed_at = admin_email, datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    await _notify_owner(db, req)
    return req


async def documents_bundle(db: AsyncSession, request_id: uuid.UUID) -> tuple[str, bytes]:
    """All of a request's documents plus a summary.txt in one ZIP, for sending to the operator."""
    import io, zipfile  # noqa: E401, PLC0415

    req = await get_request(db, request_id)
    org = await db.get(Organization, req.organization_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("summary.txt", f"Business: {org.name if org else ''}\nRequest: {LABEL.get(req.kind, req.kind)}\nValue: {req.value}\nSubmitted: {req.created_at:%Y-%m-%d}\n")
        for d in await documents_for(db, req.id):
            full = await get_document(db, req.id, d.id, None)
            z.writestr(f"{d.doc_type}-{d.filename}".replace("/", "_"), full.data)
    return f"{req.kind}-{req.value}-documents.zip".replace(" ", "_"), buf.getvalue()


async def mark_from_admin(db: AsyncSession, org_id: uuid.UUID, approved: bool, admin_email: str) -> None:
    """The tenant-detail page can still approve a Sender ID directly; keep the
    request queue consistent with it."""
    req = await db.scalar(select(VerificationRequest).where(
        VerificationRequest.organization_id == org_id, VerificationRequest.kind == "sms_sender_id",
        VerificationRequest.status.in_(OPEN_STATUSES),
    ).order_by(VerificationRequest.created_at.desc()))
    if req and approved:
        req.status, req.reviewed_by, req.reviewed_at = "approved", admin_email, datetime.now(timezone.utc)
        await db.commit()


LABEL = {"sms_sender_id": "SMS Sender ID", "whatsapp_number": "WhatsApp business number"}


async def _notify_owner(db: AsyncSession, req: VerificationRequest) -> None:
    """Best-effort email to the org owner; never blocks the decision."""
    try:
        from app.services import inbox  # noqa: PLC0415

        label = {"approved": "approved ✅", "rejected": "was not approved", "needs_info": "needs more information", "submitted": "is with the SMS operator"}[req.status]
        await inbox.notify(db, req.organization_id, await inbox.owners_and_admins(db, req.organization_id), category="account",
                           kind=f"verification_{req.status}", title=f"{LABEL[req.kind]} {req.value}: {label}",
                           body=req.admin_note or "", link="/settings?tab=sms")
        owner = await notification_service._get_owner_user(db, req.organization_id)
        if owner is None:
            return
        headline = {"approved": "approved ✅", "rejected": "not approved", "needs_info": "needs more information", "submitted": "with the SMS operator for approval"}[req.status]
        note = f"<p><strong>Note from our team:</strong> {req.admin_note}</p>" if req.admin_note else ""
        await notification_service._try_send(
            db, org_id=req.organization_id, to_email=owner.email,
            subject=f"Your {LABEL[req.kind]} request {headline}",
            html_body=f"<p>Your <strong>{LABEL[req.kind]}</strong> request for <strong>{req.value}</strong> is {headline}.</p>{note}<p>Open LeadBangla to see the details.</p>",
        )
    except Exception:  # noqa: BLE001
        log.exception("verification notification failed")
