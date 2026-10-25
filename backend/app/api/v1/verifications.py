import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_internal_user, get_current_membership
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.models.verification import VerificationRequest
from app.services import verification_service as svc
from app.services.sms_service import update_org_sms_sender_id
from app.services.wallet_service import InsufficientBalanceError

router = APIRouter(prefix="/verifications", tags=["verifications"])
admin_router = APIRouter(prefix="/admin/verifications", tags=["admin"])

Kind = Literal["sms_sender_id", "whatsapp_number"]


class DocumentRead(BaseModel):
    id: uuid.UUID
    doc_type: str
    filename: str
    content_type: str
    size: int
    created_at: datetime


class RequirementRead(BaseModel):
    type: str
    label: str
    required: bool
    hint: str
    group: str | None = None
    group_label: str | None = None
    uploaded: DocumentRead | None = None


class RequestRead(BaseModel):
    id: uuid.UUID
    kind: str
    value: str
    status: str
    customer_note: str | None
    admin_note: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    gateway_ref: str | None = None
    submitted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    organization_id: uuid.UUID
    organization_name: str | None = None
    documents: list[DocumentRead]
    requirements: list[RequirementRead]
    missing_required: list[str]


async def _read(db: AsyncSession, req: VerificationRequest, org_name: str | None = None) -> RequestRead:
    docs = await svc.documents_for(db, req.id)
    by_type = {d.doc_type: d for d in docs}
    reqs = [
        RequirementRead(**{**r, "group_label": svc.GROUP_LABELS.get(r.get("group", "")), "uploaded": DocumentRead.model_validate(by_type[r["type"]], from_attributes=True) if r["type"] in by_type and r["type"] != "other" else None})
        for r in svc.DOC_REQUIREMENTS[req.kind]
    ]
    return RequestRead(
        id=req.id, kind=req.kind, value=req.value, status=req.status, customer_note=req.customer_note,
        admin_note=req.admin_note, reviewed_by=req.reviewed_by, reviewed_at=req.reviewed_at,
        gateway_ref=req.gateway_ref, submitted_at=req.submitted_at,
        created_at=req.created_at, updated_at=req.updated_at, organization_id=req.organization_id,
        organization_name=org_name,
        documents=[DocumentRead.model_validate(d, from_attributes=True) for d in docs],
        requirements=reqs,
        missing_required=await svc.missing_required(db, req),
    )


def _err(e: Exception) -> HTTPException:
    if isinstance(e, svc.VerificationNotFoundError):
        return HTTPException(status_code=404, detail="Not found")
    return HTTPException(status_code=400, detail=str(e))


# ── Customer ─────────────────────────────────────────────────────────────────

class RequestCreate(BaseModel):
    kind: Kind
    value: str = Field(min_length=1, max_length=50)
    note: str | None = Field(default=None, max_length=1000)


@router.get("", response_model=list[RequestRead])
async def list_mine(kind: Kind | None = Query(default=None), m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return [await _read(db, r) for r in await svc.list_requests(db, m.organization_id, kind)]


@router.post("", response_model=RequestRead, status_code=status.HTTP_201_CREATED)
async def create(body: RequestCreate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        if body.kind == "sms_sender_id":
            from app.services import sms_plan  # noqa: PLC0415

            if not (await sms_plan.entitlement(db, m.organization_id))["masking_allowed"]:
                raise HTTPException(status_code=402, detail="Your plan doesn't include a masking Sender ID. Upgrade to request one.")
            # Same path as the old Sender ID form: validates, charges the one-time fee, resets approval.
            try:
                await update_org_sms_sender_id(db, m.organization_id, body.value.strip())
            except InsufficientBalanceError:
                raise HTTPException(status_code=402, detail="Insufficient wallet balance for the Sender ID setup fee")
            req = await svc.sync_sender_request(db, m.organization_id, body.value.strip(), body.note)
        else:
            from app.services import sms_plan  # noqa: PLC0415

            if not (await sms_plan.entitlement(db, m.organization_id))["whatsapp_enabled"]:
                raise HTTPException(status_code=402, detail="WhatsApp isn't included in your plan. Upgrade to set it up.")
            req = await svc.create_request(db, m.organization_id, body.kind, body.value, body.note)
        return await _read(db, req)
    except svc.VerificationError as e:
        raise _err(e)


@router.post("/{request_id}/documents", response_model=RequestRead)
async def upload(
    request_id: uuid.UUID, doc_type: str = Form(...), file: UploadFile = File(...),
    m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db),
):
    try:
        await svc.add_document(db, m.organization_id, request_id, doc_type, file.filename or "document", file.content_type or "", await file.read())
        return await _read(db, await svc.get_request(db, request_id, m.organization_id))
    except (svc.VerificationError, svc.VerificationNotFoundError) as e:
        raise _err(e)


@router.delete("/{request_id}/documents/{doc_id}", response_model=RequestRead)
async def remove_doc(request_id: uuid.UUID, doc_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        await svc.delete_document(db, m.organization_id, request_id, doc_id)
        return await _read(db, await svc.get_request(db, request_id, m.organization_id))
    except (svc.VerificationError, svc.VerificationNotFoundError) as e:
        raise _err(e)


@router.post("/{request_id}/cancel", response_model=RequestRead)
async def cancel(request_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return await _read(db, await svc.cancel_request(db, m.organization_id, request_id))
    except (svc.VerificationError, svc.VerificationNotFoundError) as e:
        raise _err(e)


def _file(doc) -> Response:
    safe = doc.filename.replace('"', "")
    return Response(content=doc.data, media_type=doc.content_type, headers={"Content-Disposition": f'inline; filename="{safe}"'})


@router.get("/{request_id}/documents/{doc_id}")
async def download(request_id: uuid.UUID, doc_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return _file(await svc.get_document(db, request_id, doc_id, m.organization_id))
    except svc.VerificationNotFoundError as e:
        raise _err(e)


# ── Admin ────────────────────────────────────────────────────────────────────

class DecisionBody(BaseModel):
    decision: Literal["approved", "rejected", "needs_info", "submitted", "revoked"]
    gateway_ref: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=2000)
    final_value: str | None = Field(default=None, max_length=50)
    skip_documents: bool = False   # admin vouches for the customer; no uploads needed


@admin_router.get("", response_model=list[RequestRead])
async def admin_list(status_: str | None = Query(default=None, alias="status"), kind: Kind | None = Query(default=None), _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)):
    return [await _read(db, r, name) for r, name in await svc.admin_list(db, status_, kind)]


@admin_router.get("/pending-count")
async def admin_pending_count(_: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)):
    return {"pending": await svc.open_count(db)}


@admin_router.post("/{request_id}/decision", response_model=RequestRead)
async def admin_decide(request_id: uuid.UUID, body: DecisionBody, user: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)):
    try:
        req = await svc.decide(db, request_id, body.decision, body.note, user.email, body.final_value, body.gateway_ref, body.skip_documents)
        org = await db.get(Organization, req.organization_id)
        return await _read(db, req, org.name if org else None)
    except (svc.VerificationError, svc.VerificationNotFoundError) as e:
        raise _err(e)


@admin_router.get("/{request_id}/bundle")
async def admin_bundle(request_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)):
    try:
        name, data = await svc.documents_bundle(db, request_id)
    except svc.VerificationNotFoundError as e:
        raise _err(e)
    return Response(content=data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@admin_router.get("/{request_id}/documents/{doc_id}")
async def admin_download(request_id: uuid.UUID, doc_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)):
    try:
        return _file(await svc.get_document(db, request_id, doc_id, None))
    except svc.VerificationNotFoundError as e:
        raise _err(e)
