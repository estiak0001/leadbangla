import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.affiliate import ReferralLink
from app.models.influencer import Deliverable, Influencer
from app.schemas.influencer import (
    DeliverableCreate,
    DeliverableRead,
    DeliverableUpdate,
    InfluencerCreate,
    InfluencerUpdate,
)


# ---------------------------------------------------------------------------
# Influencer CRUD
# ---------------------------------------------------------------------------

async def list_influencers(db: AsyncSession, org_id: uuid.UUID) -> list[Influencer]:
    result = await db.execute(
        select(Influencer)
        .where(Influencer.organization_id == org_id)
        .order_by(Influencer.created_at.desc())
    )
    return list(result.scalars().all())


async def create_influencer(db: AsyncSession, org_id: uuid.UUID, data: InfluencerCreate) -> Influencer:
    obj = Influencer(organization_id=org_id, **data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_influencer(
    db: AsyncSession, org_id: uuid.UUID, influencer_id: uuid.UUID
) -> Influencer | None:
    result = await db.execute(
        select(Influencer).where(
            Influencer.id == influencer_id,
            Influencer.organization_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def update_influencer(
    db: AsyncSession, org_id: uuid.UUID, influencer_id: uuid.UUID, data: InfluencerUpdate
) -> Influencer | None:
    obj = await get_influencer(db, org_id, influencer_id)
    if not obj:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_influencer(
    db: AsyncSession, org_id: uuid.UUID, influencer_id: uuid.UUID
) -> bool:
    obj = await get_influencer(db, org_id, influencer_id)
    if not obj:
        return False
    await db.delete(obj)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Deliverable CRUD
# ---------------------------------------------------------------------------

def _deliverable_to_dict(d: Deliverable, code: str | None, clicks: int, conversions: int) -> dict:
    return {
        "id": d.id,
        "influencer_id": d.influencer_id,
        "type": d.type,
        "description": d.description,
        "due_date": d.due_date,
        "status": d.status,
        "referral_link_id": d.referral_link_id,
        "referral_link_code": code,
        "outcome_clicks": clicks,
        "outcome_conversions": conversions,
        "submitted_at": d.submitted_at,
        "approved_at": d.approved_at,
        "created_at": d.created_at,
    }


async def list_deliverables(
    db: AsyncSession, org_id: uuid.UUID, influencer_id: uuid.UUID
) -> list[dict]:
    rows = await db.execute(
        select(Deliverable, ReferralLink.code, ReferralLink.clicks, ReferralLink.conversions)
        .outerjoin(ReferralLink, Deliverable.referral_link_id == ReferralLink.id)
        .where(
            Deliverable.influencer_id == influencer_id,
            Deliverable.organization_id == org_id,
        )
        .order_by(Deliverable.created_at.desc())
    )
    return [
        _deliverable_to_dict(d, code, clicks or 0, conversions or 0)
        for d, code, clicks, conversions in rows.all()
    ]


async def create_deliverable(
    db: AsyncSession, org_id: uuid.UUID, influencer_id: uuid.UUID, data: DeliverableCreate
) -> dict | None:
    if not await get_influencer(db, org_id, influencer_id):
        return None
    obj = Deliverable(
        organization_id=org_id,
        influencer_id=influencer_id,
        **data.model_dump(),
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _deliverable_to_dict(obj, None, 0, 0)


async def _get_deliverable(
    db: AsyncSession, org_id: uuid.UUID, deliverable_id: uuid.UUID
) -> Deliverable | None:
    result = await db.execute(
        select(Deliverable).where(
            Deliverable.id == deliverable_id,
            Deliverable.organization_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def update_deliverable(
    db: AsyncSession, org_id: uuid.UUID, deliverable_id: uuid.UUID, data: DeliverableUpdate
) -> dict | None:
    obj = await _get_deliverable(db, org_id, deliverable_id)
    if not obj:
        return None

    fields = data.model_dump(exclude_none=True)
    for field, value in fields.items():
        setattr(obj, field, value)

    if data.status == "submitted" and not obj.submitted_at:
        obj.submitted_at = datetime.now(timezone.utc)
    if data.status == "approved" and not obj.approved_at:
        obj.approved_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(obj)

    # Fetch link stats if assigned
    code, clicks, conversions = None, 0, 0
    if obj.referral_link_id:
        link = await db.get(ReferralLink, obj.referral_link_id)
        if link:
            code, clicks, conversions = link.code, link.clicks, link.conversions

    return _deliverable_to_dict(obj, code, clicks, conversions)


async def delete_deliverable(
    db: AsyncSession, org_id: uuid.UUID, deliverable_id: uuid.UUID
) -> bool:
    obj = await _get_deliverable(db, org_id, deliverable_id)
    if not obj:
        return False
    await db.delete(obj)
    await db.commit()
    return True
