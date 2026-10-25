from __future__ import annotations

from uuid import UUID

from datetime import datetime, timezone

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.seo import SeoAudit, SeoPage
from app.services.plan_service import ensure_within_limit


async def list_audits(db: AsyncSession, org_id: UUID) -> list[SeoAudit]:
    result = await db.scalars(
        select(SeoAudit)
        .where(SeoAudit.organization_id == org_id)
        .order_by(SeoAudit.created_at.desc())
    )
    return list(result.all())


async def count_audits_this_month(db: AsyncSession, org_id: UUID) -> int:
    """SEO credits used this month. One audit costs one credit; deleting an
    audit does not refund it, so this counts rows by creation month."""
    now = datetime.now(timezone.utc)
    return (
        await db.scalar(
            select(func.count(SeoAudit.id)).where(
                SeoAudit.organization_id == org_id,
                extract("year", SeoAudit.created_at) == now.year,
                extract("month", SeoAudit.created_at) == now.month,
            )
        )
        or 0
    )


async def create_audit(db: AsyncSession, org_id: UUID, url: str) -> SeoAudit:
    await ensure_within_limit(db, org_id, "seo_credits_monthly", "seo_credits", await count_audits_this_month(db, org_id))
    audit = SeoAudit(organization_id=org_id, url=url)
    db.add(audit)
    await db.commit()
    await db.refresh(audit)
    return audit


async def get_audit(db: AsyncSession, org_id: UUID, audit_id: UUID) -> SeoAudit | None:
    audit = await db.get(SeoAudit, audit_id)
    if not audit or audit.organization_id != org_id:
        return None
    return audit


async def get_audit_pages(db: AsyncSession, audit_id: UUID) -> list[SeoPage]:
    result = await db.scalars(
        select(SeoPage)
        .where(SeoPage.audit_id == audit_id)
        .order_by(SeoPage.crawled_at)
    )
    return list(result.all())


async def delete_audit(db: AsyncSession, org_id: UUID, audit_id: UUID) -> bool:
    audit = await db.get(SeoAudit, audit_id)
    if not audit or audit.organization_id != org_id:
        return False
    await db.delete(audit)
    await db.commit()
    return True
