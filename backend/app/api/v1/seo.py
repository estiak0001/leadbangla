from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.seo import SeoPage
from app.schemas.seo import AuditCreate, SeoAuditRead, SeoPageRead
from app.services import seo_service

router = APIRouter(prefix="/seo", tags=["seo"])


@router.get("/audits", response_model=list[SeoAuditRead])
async def list_audits(
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await seo_service.list_audits(db, membership.organization_id)


@router.post("/audits", response_model=SeoAuditRead, status_code=202)
async def create_audit(
    body: AuditCreate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    url = body.url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    audit = await seo_service.create_audit(db, membership.organization_id, url)

    # Fire Celery task (lazy import to avoid circular)
    from app.workers.seo_crawler import crawl_site_task  # noqa: PLC0415
    crawl_site_task.delay(str(audit.id), url)

    return audit


@router.get("/audits/{audit_id}", response_model=SeoAuditRead)
async def get_audit(
    audit_id: UUID,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    audit = await seo_service.get_audit(db, membership.organization_id, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    pages = await seo_service.get_audit_pages(db, audit_id)
    result = SeoAuditRead.model_validate(audit)
    result.pages = [SeoPageRead.model_validate(p) for p in pages]
    return result


@router.delete("/audits/{audit_id}", status_code=204)
async def delete_audit(
    audit_id: UUID,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    ok = await seo_service.delete_audit(db, membership.organization_id, audit_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Audit not found")
