import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.organization import OrganizationMember
from app.schemas.landing_page import LandingPageCreate, LandingPageRead, LandingPageUpdate
from app.services import landing_page_service as svc

router = APIRouter(prefix="/landing-pages", tags=["landing-pages"])


def _to_read(page, submission_count: int = 0) -> LandingPageRead:
    return LandingPageRead(
        id=page.id,
        slug=page.slug,
        title=page.title,
        blocks=page.blocks,
        is_published=page.is_published,
        published_at=page.published_at,
        created_at=page.created_at,
        updated_at=page.updated_at,
        submission_count=submission_count,
    )


@router.get("", response_model=list[LandingPageRead])
async def list_landing_pages(
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    pages = await svc.list_landing_pages(db, member.organization_id)
    result = []
    for p in pages:
        count = await svc.submission_count(db, p.id)
        result.append(_to_read(p, count))
    return result


@router.post("", response_model=LandingPageRead, status_code=status.HTTP_201_CREATED)
async def create_landing_page(
    body: LandingPageCreate,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    page = await svc.create_landing_page(db, member.organization_id, title=body.title, blocks=body.blocks)
    return _to_read(page)


@router.get("/{page_id}", response_model=LandingPageRead)
async def get_landing_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    try:
        page = await svc.get_landing_page(db, member.organization_id, page_id)
    except svc.LandingPageNotFoundError:
        raise HTTPException(status_code=404, detail="Landing page not found")
    count = await svc.submission_count(db, page.id)
    return _to_read(page, count)


@router.put("/{page_id}", response_model=LandingPageRead)
async def update_landing_page(
    page_id: uuid.UUID,
    body: LandingPageUpdate,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    try:
        page = await svc.update_landing_page(
            db,
            member.organization_id,
            page_id,
            title=body.title,
            blocks=body.blocks,
            is_published=body.is_published,
        )
    except svc.LandingPageNotFoundError:
        raise HTTPException(status_code=404, detail="Landing page not found")
    count = await svc.submission_count(db, page.id)
    return _to_read(page, count)


@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_landing_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    member: OrganizationMember = Depends(get_current_membership),
):
    try:
        await svc.delete_landing_page(db, member.organization_id, page_id)
    except svc.LandingPageNotFoundError:
        raise HTTPException(status_code=404, detail="Landing page not found")
