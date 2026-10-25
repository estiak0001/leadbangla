"""Pay for a plan by bKash / Nagad / Rocket / bank transfer and submit proof; staff approve or reject."""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_internal_user, get_current_user
from app.models.billing import Plan, Subscription
from app.models.enums import SubscriptionStatus
from app.models.manual_payment import ManualPayment, ManualPaymentDocument
from app.models.user import User
from app.services.billing_service import PlanNotFoundError, create_pending_subscription, get_plan

router = APIRouter(prefix="/billing/manual", tags=["billing"])
admin_router = APIRouter(prefix="/admin/manual-payments", tags=["admin"])

METHOD_LABELS = {"bkash": "bKash", "nagad": "Nagad", "rocket": "Rocket", "bank": "Bank transfer"}
ALLOWED_TYPES = {"image/jpeg", "image/png", "application/pdf"}
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_FILES = 5


def _configured_methods() -> list[dict]:
    details = {
        "bkash": settings.manual_pay_bkash, "nagad": settings.manual_pay_nagad,
        "rocket": settings.manual_pay_rocket, "bank": settings.manual_pay_bank,
    }
    return [{"method": m, "label": METHOD_LABELS[m], "details": d} for m, d in details.items() if d.strip()]


class DocRead(BaseModel):
    id: uuid.UUID
    filename: str
    content_type: str
    size: int


class PaymentRead(BaseModel):
    id: uuid.UUID
    method: str
    amount_bdt: int
    sender_account: str
    trx_id: str
    customer_note: str | None
    status: str
    admin_note: str | None
    created_at: datetime
    plan_name: str | None = None
    customer_email: str | None = None
    documents: list[DocRead] = []


async def _read(db: AsyncSession, p: ManualPayment) -> PaymentRead:
    sub = await db.get(Subscription, p.subscription_id)
    plan = await db.get(Plan, sub.plan_id) if sub else None
    user = await db.get(User, p.user_id)
    docs = (await db.scalars(select(ManualPaymentDocument).where(ManualPaymentDocument.payment_id == p.id))).all()
    return PaymentRead(
        id=p.id, method=p.method, amount_bdt=p.amount_bdt, sender_account=p.sender_account, trx_id=p.trx_id,
        customer_note=p.customer_note, status=p.status, admin_note=p.admin_note, created_at=p.created_at,
        plan_name=plan.name if plan else None, customer_email=user.email if user else None,
        documents=[DocRead(id=d.id, filename=d.filename, content_type=d.content_type, size=d.size) for d in docs],
    )


@router.get("/methods")
async def manual_methods() -> list[dict]:
    return _configured_methods()


@router.post("/payments", response_model=PaymentRead)
async def submit_manual_payment(
    plan_id: uuid.UUID = Form(...),
    method: Literal["bkash", "nagad", "rocket", "bank"] = Form(...),
    sender_account: str = Form(..., min_length=3, max_length=100),
    trx_id: str = Form(..., min_length=3, max_length=100),
    note: str | None = Form(default=None, max_length=1000),
    files: list[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentRead:
    if method not in {m["method"] for m in _configured_methods()}:
        raise HTTPException(status_code=400, detail="This payment method is not available")
    try:
        plan = await get_plan(db, plan_id)
    except PlanNotFoundError:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.price_bdt == 0:
        raise HTTPException(status_code=400, detail="The free plan needs no payment")
    if not files:
        raise HTTPException(status_code=400, detail="Attach at least one proof (payment screenshot or receipt)")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILES} files")

    blobs: list[tuple[UploadFile, bytes]] = []
    for f in files:
        data = await f.read()
        if f.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"{f.filename}: only JPG, PNG or PDF files are accepted")
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"{f.filename}: larger than 5 MB")
        blobs.append((f, data))

    duplicate = await db.scalar(
        select(func.count(ManualPayment.id)).where(
            ManualPayment.trx_id == trx_id.strip(), ManualPayment.method == method,
            ManualPayment.status.in_(["pending", "approved"]),
        )
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="This transaction ID was already submitted")

    subscription = await create_pending_subscription(db, current_user.id, plan)
    payment = ManualPayment(
        user_id=current_user.id, subscription_id=subscription.id, method=method, amount_bdt=plan.price_bdt,
        sender_account=sender_account.strip(), trx_id=trx_id.strip(), customer_note=note,
    )
    db.add(payment)
    await db.flush()
    for f, data in blobs:
        db.add(ManualPaymentDocument(
            payment_id=payment.id, filename=(f.filename or "proof")[:255], content_type=f.content_type or "",
            size=len(data), data=data,
        ))
    await db.commit()
    await db.refresh(payment)
    return await _read(db, payment)


@router.get("/payments", response_model=list[PaymentRead])
async def my_manual_payments(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[PaymentRead]:
    rows = await db.scalars(
        select(ManualPayment).where(ManualPayment.user_id == current_user.id).order_by(ManualPayment.created_at.desc())
    )
    return [await _read(db, p) for p in rows]


# ── staff ──────────────────────────────────────────────────────────────────

class Decision(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


@admin_router.get("", response_model=list[PaymentRead])
async def admin_list(
    status: str | None = None,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[PaymentRead]:
    q = select(ManualPayment).order_by(ManualPayment.created_at.desc()).limit(200)
    if status:
        q = q.where(ManualPayment.status == status)
    return [await _read(db, p) for p in await db.scalars(q)]


@admin_router.get("/pending-count")
async def admin_pending_count(
    _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)
) -> dict:
    n = await db.scalar(select(func.count(ManualPayment.id)).where(ManualPayment.status == "pending"))
    return {"pending": n or 0}


@admin_router.get("/{payment_id}/documents/{doc_id}")
async def admin_document(
    payment_id: uuid.UUID, doc_id: uuid.UUID,
    _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db),
) -> Response:
    doc = await db.get(ManualPaymentDocument, doc_id)
    if doc is None or doc.payment_id != payment_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(content=doc.data, media_type=doc.content_type,
                    headers={"Content-Disposition": f'inline; filename="{doc.filename}"'})


async def _decide(db: AsyncSession, payment_id: uuid.UUID, staff: User, approve: bool, note: str | None) -> PaymentRead:
    payment = await db.get(ManualPayment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status != "pending":
        raise HTTPException(status_code=400, detail=f"Already {payment.status}")
    if not approve and not (note or "").strip():
        raise HTTPException(status_code=400, detail="Give the customer a reason for rejecting")
    sub = await db.get(Subscription, payment.subscription_id)
    payment.status = "approved" if approve else "rejected"
    payment.admin_note = note
    payment.reviewed_by = staff.email
    payment.reviewed_at = datetime.now(timezone.utc)
    if sub is not None:
        if approve:
            sub.status = SubscriptionStatus.ACTIVE
            sub.gateway_val_id = f"manual:{payment.method}:{payment.trx_id}"[:128]
            sub.source = "manual"
        else:
            sub.status = SubscriptionStatus.FAILED
        sub.changed_by = staff.email
    await db.commit()
    await db.refresh(payment)
    return await _read(db, payment)


@admin_router.post("/{payment_id}/approve", response_model=PaymentRead)
async def admin_approve(
    payment_id: uuid.UUID, body: Decision, staff: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)
) -> PaymentRead:
    return await _decide(db, payment_id, staff, True, body.note)


@admin_router.post("/{payment_id}/reject", response_model=PaymentRead)
async def admin_reject(
    payment_id: uuid.UUID, body: Decision, staff: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)
) -> PaymentRead:
    return await _decide(db, payment_id, staff, False, body.note)
