import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.affiliate import Commission, ReferralClick, ReferralLink, ReferralProgram
from app.schemas.affiliate import ConversionCreate, LinkCreate, ProgramCreate, ProgramUpdate


async def list_programs(db: AsyncSession, org_id: uuid.UUID) -> list[ReferralProgram]:
    result = await db.execute(
        select(ReferralProgram)
        .where(ReferralProgram.organization_id == org_id)
        .order_by(ReferralProgram.created_at.desc())
    )
    return list(result.scalars().all())


async def create_program(db: AsyncSession, org_id: uuid.UUID, data: ProgramCreate) -> ReferralProgram:
    program = ReferralProgram(organization_id=org_id, **data.model_dump())
    db.add(program)
    await db.commit()
    await db.refresh(program)
    return program


async def get_program(db: AsyncSession, org_id: uuid.UUID, program_id: uuid.UUID) -> ReferralProgram | None:
    result = await db.execute(
        select(ReferralProgram).where(
            ReferralProgram.id == program_id,
            ReferralProgram.organization_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def update_program(
    db: AsyncSession, org_id: uuid.UUID, program_id: uuid.UUID, data: ProgramUpdate
) -> ReferralProgram | None:
    program = await get_program(db, org_id, program_id)
    if not program:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(program, field, value)
    await db.commit()
    await db.refresh(program)
    return program


async def delete_program(db: AsyncSession, org_id: uuid.UUID, program_id: uuid.UUID) -> bool:
    program = await get_program(db, org_id, program_id)
    if not program:
        return False
    await db.delete(program)
    await db.commit()
    return True


async def list_links(
    db: AsyncSession, org_id: uuid.UUID, program_id: uuid.UUID | None = None
) -> list[ReferralLink]:
    q = select(ReferralLink).where(ReferralLink.organization_id == org_id)
    if program_id:
        q = q.where(ReferralLink.program_id == program_id)
    result = await db.execute(q.order_by(ReferralLink.created_at.desc()))
    return list(result.scalars().all())


async def create_link(
    db: AsyncSession, org_id: uuid.UUID, program_id: uuid.UUID, data: LinkCreate
) -> ReferralLink | None:
    if not await get_program(db, org_id, program_id):
        return None
    link = ReferralLink(organization_id=org_id, program_id=program_id, contact_id=data.contact_id)
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


async def delete_link(db: AsyncSession, org_id: uuid.UUID, link_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(ReferralLink).where(
            ReferralLink.id == link_id,
            ReferralLink.organization_id == org_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        return False
    await db.delete(link)
    await db.commit()
    return True


async def record_click(
    db: AsyncSession,
    code: str,
    ip: str | None,
    user_agent: str | None,
    referer: str | None,
) -> tuple[ReferralClick | None, str | None, int | None]:
    result = await db.execute(select(ReferralLink).where(ReferralLink.code == code))
    link = result.scalar_one_or_none()
    if not link:
        return None, None, None

    click = ReferralClick(link_id=link.id, ip_address=ip, user_agent=user_agent, referer=referer)
    db.add(click)
    link.clicks += 1
    await db.commit()
    await db.refresh(click)

    prog_result = await db.execute(select(ReferralProgram).where(ReferralProgram.id == link.program_id))
    program = prog_result.scalar_one_or_none()
    target_url = program.target_url if program else "/"
    cookie_days = program.cookie_days if program else 30

    return click, target_url, cookie_days


async def record_conversion(
    db: AsyncSession, org_id: uuid.UUID, data: ConversionCreate
) -> Commission | None:
    result = await db.execute(
        select(ReferralLink).where(
            ReferralLink.code == data.code,
            ReferralLink.organization_id == org_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        return None

    prog_result = await db.execute(select(ReferralProgram).where(ReferralProgram.id == link.program_id))
    program = prog_result.scalar_one_or_none()
    if not program:
        return None

    if program.commission_type == "percentage":
        amount = round(data.conversion_value * program.commission_value / 100, 2)
    else:
        amount = program.commission_value

    # Most recent unconverted click for this link
    click_result = await db.execute(
        select(ReferralClick)
        .where(ReferralClick.link_id == link.id, ReferralClick.converted == False)  # noqa: E712
        .order_by(ReferralClick.clicked_at.desc())
        .limit(1)
    )
    click = click_result.scalar_one_or_none()

    commission = Commission(
        organization_id=org_id,
        program_id=link.program_id,
        link_id=link.id,
        contact_id=link.contact_id,
        click_id=click.id if click else None,
        commission_amount=amount,
        conversion_value=data.conversion_value,
        status="pending",
        notes=data.notes,
    )
    db.add(commission)
    link.conversions += 1
    if click:
        click.converted = True
    await db.commit()
    await db.refresh(commission)
    return commission


async def list_commissions(db: AsyncSession, org_id: uuid.UUID) -> list[Commission]:
    result = await db.execute(
        select(Commission)
        .where(Commission.organization_id == org_id)
        .order_by(Commission.created_at.desc())
    )
    return list(result.scalars().all())


async def update_commission_status(
    db: AsyncSession, org_id: uuid.UUID, commission_id: uuid.UUID, status: str
) -> Commission | None:
    result = await db.execute(
        select(Commission).where(
            Commission.id == commission_id,
            Commission.organization_id == org_id,
        )
    )
    commission = result.scalar_one_or_none()
    if not commission:
        return None
    commission.status = status
    await db.commit()
    await db.refresh(commission)
    return commission
