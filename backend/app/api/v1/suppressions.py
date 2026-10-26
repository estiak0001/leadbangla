import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.organization import OrganizationMember
from app.services import unsubscribe_service as us

router = APIRouter(prefix="/email-suppressions", tags=["email-suppressions"])

LABELS = {"unsubscribe": "Unsubscribed", "bounce": "Bounced", "complaint": "Reported spam", "manual": "Added by you"}


@router.get("")
async def list_suppressions(q: str | None = None, reason: str | None = None, limit: int = Query(100, le=200), offset: int = 0,
                            m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    rows = await us.list_suppressed(db, m.organization_id, q=q, reason=reason, limit=limit, offset=offset)
    return {"counts": await us.suppression_counts(db, m.organization_id),
            "items": [{"id": r.id, "email": r.email, "reason": r.reason, "label": LABELS.get(r.reason, r.reason),
                       "can_remove": r.reason not in ("bounce", "complaint"), "created_at": r.created_at} for r in rows]}


class AddBody(BaseModel):
    email: str = Field(min_length=5, max_length=255)


@router.post("", status_code=201)
async def add(p: AddBody, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    email = p.email.strip().lower()
    if "@" not in email or " " in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    created = await us.add_suppression(db, m.organization_id, email, "manual")
    await db.commit()
    return {"added": created}


@router.delete("/{suppression_id}", status_code=204)
async def remove(suppression_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> None:
    try:
        await us.remove_suppression(db, m.organization_id, suppression_id)
    except us.SuppressionError as e:
        raise HTTPException(status_code=409 if "reputation" in str(e) else 404, detail=str(e))
