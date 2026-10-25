from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.schemas.affiliate import (
    CommissionRead,
    CommissionStatusUpdate,
    ConversionCreate,
    LinkCreate,
    LinkRead,
    ProgramCreate,
    ProgramRead,
    ProgramUpdate,
)
from app.services import affiliate_service as svc

router = APIRouter(prefix="/referral", tags=["referral"])


@router.get("/programs", response_model=list[ProgramRead])
async def list_programs(
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_programs(db, membership.organization_id)


@router.post("/programs", response_model=ProgramRead, status_code=201)
async def create_program(
    body: ProgramCreate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_program(db, membership.organization_id, body)


@router.put("/programs/{program_id}", response_model=ProgramRead)
async def update_program(
    program_id: UUID,
    body: ProgramUpdate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    p = await svc.update_program(db, membership.organization_id, program_id, body)
    if not p:
        raise HTTPException(status_code=404, detail="Program not found")
    return p


@router.delete("/programs/{program_id}", status_code=204)
async def delete_program(
    program_id: UUID,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    if not await svc.delete_program(db, membership.organization_id, program_id):
        raise HTTPException(status_code=404, detail="Program not found")


@router.get("/links", response_model=list[LinkRead])
async def list_links(
    program_id: UUID | None = None,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_links(db, membership.organization_id, program_id)


@router.post("/programs/{program_id}/links", response_model=LinkRead, status_code=201)
async def create_link(
    program_id: UUID,
    body: LinkCreate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    link = await svc.create_link(db, membership.organization_id, program_id, body)
    if not link:
        raise HTTPException(status_code=404, detail="Program not found")
    return link


@router.delete("/links/{link_id}", status_code=204)
async def delete_link(
    link_id: UUID,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    if not await svc.delete_link(db, membership.organization_id, link_id):
        raise HTTPException(status_code=404, detail="Link not found")


@router.post("/conversions", response_model=CommissionRead, status_code=201)
async def record_conversion(
    body: ConversionCreate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    commission = await svc.record_conversion(db, membership.organization_id, body)
    if not commission:
        raise HTTPException(status_code=404, detail="Referral code not found")
    return commission


@router.get("/commissions", response_model=list[CommissionRead])
async def list_commissions(
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_commissions(db, membership.organization_id)


@router.patch("/commissions/{commission_id}/status", response_model=CommissionRead)
async def update_commission_status(
    commission_id: UUID,
    body: CommissionStatusUpdate,
    membership=Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    c = await svc.update_commission_status(db, membership.organization_id, commission_id, body.status)
    if not c:
        raise HTTPException(status_code=404, detail="Commission not found")
    return c
