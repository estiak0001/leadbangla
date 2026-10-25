import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_internal_user, get_current_membership
from app.models.organization import OrganizationMember
from app.models.user import User
from app.schemas.email_domain import (
    EmailProviderInfo, SenderAddressCreate, SenderAddressRead, SendingDomainCreate, SendingDomainRead, SendingDomainUpdate,
    TestEmailRequest, TestEmailResult,
)
from app.services import email_domain_service as svc

router = APIRouter(prefix="/email-domains", tags=["email-domains"])


def _domain(d) -> SendingDomainRead:
    return SendingDomainRead(
        id=d.id, domain=d.domain, provider=d.provider, status=d.status,
        dns_records=d.dns_records or [], verified_at=d.verified_at,
        paused_reason=d.paused_reason, status_note=d.status_note, dns_submitted_at=d.dns_submitted_at, last_checked_at=d.last_checked_at, deleted_at=d.deleted_at, created_at=d.created_at,
    )


def _bad(e: Exception) -> HTTPException:
    if isinstance(e, svc.NotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/provider", response_model=EmailProviderInfo)
async def email_provider(m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    """What actually delivers this platform's email right now."""
    from app.services.email_provider_service import NOT_CONFIGURED_MESSAGE, get_provider

    p = await get_provider(db)
    return EmailProviderInfo(
        kind=p.kind, label=p.label, configured=p.configured,
        message=(f"Emails are delivered through {p.label}." if p.configured else NOT_CONFIGURED_MESSAGE),
        region=p.config.get("region") if p.kind == "ses" else None,
    )


@router.get("", response_model=list[SendingDomainRead])
async def list_domains(m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return [_domain(d) for d in await svc.list_domains(db, m.organization_id)]


@router.post("", response_model=SendingDomainRead, status_code=status.HTTP_201_CREATED)
async def add_domain(payload: SendingDomainCreate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return _domain(await svc.add_domain(db, m.organization_id, payload.domain))
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)


@router.post("/{domain_id}/verify", response_model=SendingDomainRead)
async def verify_domain(domain_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return _domain(await svc.verify_domain(db, m.organization_id, domain_id))
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)


@router.post("/{domain_id}/register-ses", response_model=SendingDomainRead)
async def register_ses(domain_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return _domain(await svc.register_with_ses(db, m.organization_id, domain_id))
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)


@router.get("/trash", response_model=list[SendingDomainRead])
async def list_trash(m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return [_domain(d) for d in await svc.list_trashed_domains(db, m.organization_id)]


@router.post("/trash/{domain_id}/restore", response_model=SendingDomainRead)
async def restore(domain_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return _domain(await svc.restore_domain(db, m.organization_id, domain_id))
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)


@router.delete("/trash/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def purge(domain_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        await svc.purge_domain(db, m.organization_id, domain_id)
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)


@router.put("/{domain_id}", response_model=SendingDomainRead)
async def update_domain(domain_id: uuid.UUID, payload: SendingDomainUpdate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return _domain(await svc.update_domain(db, m.organization_id, domain_id, payload.domain))
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)


@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(domain_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    """Soft delete — moves the domain to the trash."""
    try:
        await svc.delete_domain(db, m.organization_id, domain_id)
    except svc.NotFoundError as e:
        raise _bad(e)


@router.post("/{domain_id}/resume", response_model=SendingDomainRead)
async def resume_domain(domain_id: uuid.UUID, _: User = Depends(get_current_internal_user), db: AsyncSession = Depends(get_db)):
    """Internal staff only: lifts an automatic abuse pause after review."""
    try:
        return _domain(await svc.resume_domain(db, domain_id))
    except svc.NotFoundError as e:
        raise _bad(e)


@router.get("/senders", response_model=list[SenderAddressRead])
async def list_senders(m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return await svc.list_senders(db, m.organization_id)


@router.post("/senders", response_model=SenderAddressRead, status_code=status.HTTP_201_CREATED)
async def add_sender(payload: SenderAddressCreate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.add_sender(db, m.organization_id, payload.domain_id, payload.email, payload.name)
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)


@router.post("/senders/{sender_id}/default", response_model=SenderAddressRead)
async def make_default(sender_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.set_default_sender(db, m.organization_id, sender_id)
    except svc.NotFoundError as e:
        raise _bad(e)


@router.delete("/senders/{sender_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sender(sender_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        await svc.delete_sender(db, m.organization_id, sender_id)
    except svc.NotFoundError as e:
        raise _bad(e)


@router.post("/senders/{sender_id}/test", response_model=TestEmailResult)
async def send_test(sender_id: uuid.UUID, payload: TestEmailRequest, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        mid = await svc.send_test_email(db, m.organization_id, sender_id, payload.to_email)
    except (svc.EmailDomainError, svc.NotFoundError) as e:
        raise _bad(e)
    return TestEmailResult(ok=True, message_id=mid)
