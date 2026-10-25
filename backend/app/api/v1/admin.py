import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.core.db import get_db
from app.core.deps import get_current_internal_user
from app.core.security import create_impersonation_token
from app.models.organization import Organization
from app.models.billing import Subscription
from app.models.platform_service import PlatformService
from app.models.user import User
from app.schemas.admin import (
    AdminSmsSenderUpdate,
    AdminTenantCreateRequest,
    ImpersonateRequest,
    ImpersonateResponse,
    RevenueSummary,
    TenantDetail,
    TenantListItem,
    TenantMemberRead,
    WalletAdjustRequest,
    WalletAdjustResponse,
    WalletAdminRead,
    WalletTransactionFeedRead,
)
from app.schemas.billing import CreditRateRead, CreditRateUpdate, PlanCreate, PlanReadFull, PlanUpdate, WalletTransactionRead
from app.schemas.platform_service import IntegrationTestResult, PlatformServiceRead, PlatformServiceUpdate
from app.services.admin_service import (
    ImpersonationTargetError,
    TenantNotFoundError,
    TenantOwnerAlreadyAssignedError,
    admin_create_tenant,
    get_latest_subscription_for_org,
    get_member_for_impersonation,
    get_organization,
    get_owner_email,
    get_revenue_summary,
    list_org_wallets,
    list_organizations,
    list_recent_wallet_transactions,
)
from app.services.billing_service import PlanNotFoundError as SubscriptionPlanNotFoundError
from app.services.integration_test_service import test_service
from app.services.sms_service import admin_set_org_sms_sender, get_org_sms_settings
from app.services.plan_service import (
    CreditRateNotFoundError,
    PlanCodeTakenError,
    PlanInUseError,
    PlanNotFoundError,
    create_plan,
    delete_plan,
    count_org_tenants_per_plan,
    list_all_plans,
    list_credit_rates,
    update_credit_rate,
    update_plan,
)
from app.services.wallet_service import admin_adjust, list_transactions

router = APIRouter(prefix="/admin", tags=["admin"])


def _to_list_item(org: Organization, subscription: Subscription | None) -> TenantListItem:
    return TenantListItem(
        id=org.id,
        name=org.name,
        language=org.language.value,
        created_at=org.created_at,
        owner_email=get_owner_email(org),
        plan_name=subscription.plan.name if subscription else None,
        subscription_status=subscription.status.value if subscription else None,
        member_count=len(org.members),
        phone=org.phone,
        website=org.website,
        industry=org.industry,
        company_size=org.company_size,
        is_suspended=org.is_suspended,
    )


@router.get("/tenants", response_model=list[TenantListItem])
async def list_tenants(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[TenantListItem]:
    orgs = await list_organizations(db)
    items = []
    for org in orgs:
        subscription = await get_latest_subscription_for_org(db, org.id)
        items.append(_to_list_item(org, subscription))
    return items


async def _to_detail(db: AsyncSession, org: Organization) -> TenantDetail:
    subscription = await get_latest_subscription_for_org(db, org.id)
    base = _to_list_item(org, subscription)
    members = [
        TenantMemberRead(
            user_id=member.user_id,
            email=member.user.email,
            role=member.role.value,
            joined_at=member.created_at,
        )
        for member in org.members
    ]
    sender_id, suggested, approved = await get_org_sms_settings(db, org.id)
    from app.services.wallet_service import get_balance  # noqa: PLC0415

    return TenantDetail(
        **base.model_dump(),
        display_name=org.display_name, contact_email=org.contact_email, address=org.address, city=org.city,
        country=org.country, trade_license_no=org.trade_license_no, tin=org.tin, internal_notes=org.internal_notes,
        suspended_reason=org.suspended_reason, wallet_balance_bdt=round(await get_balance(db, org.id) / 100, 2),
        members=members,
        sms_sender_id=sender_id,
        sms_sender_id_suggested=suggested,
        sms_sender_id_approved=approved,
    )


@router.get("/tenants/{org_id}", response_model=TenantDetail)
async def tenant_detail(
    org_id: uuid.UUID,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> TenantDetail:
    try:
        org = await get_organization(db, org_id)
    except TenantNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return await _to_detail(db, org)


@router.patch("/tenants/{org_id}/sms-sender", response_model=TenantDetail)
async def update_tenant_sms_sender(
    org_id: uuid.UUID,
    payload: AdminSmsSenderUpdate,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> TenantDetail:
    """Platform-only: assign/confirm a tenant's masking Sender ID after
    verifying BTRC/aggregator approval directly with SSL Wireless."""
    try:
        org = await get_organization(db, org_id)
    except TenantNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    await admin_set_org_sms_sender(db, org_id, sender_id=payload.sender_id, approved=payload.approved)
    from app.services.verification_service import mark_from_admin  # noqa: PLC0415

    await mark_from_admin(db, org_id, payload.approved, _.email)
    return await _to_detail(db, org)


@router.post("/tenants", response_model=TenantDetail, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    payload: AdminTenantCreateRequest,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> TenantDetail:
    try:
        org = await admin_create_tenant(db, payload)
    except TenantOwnerAlreadyAssignedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email already belongs to a tenant",
        )
    except SubscriptionPlanNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return await _to_detail(db, org)


@router.post("/tenants/{org_id}/impersonate", response_model=ImpersonateResponse)
async def impersonate(
    org_id: uuid.UUID,
    payload: ImpersonateRequest,
    current_user: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> ImpersonateResponse:
    try:
        member = await get_member_for_impersonation(db, org_id, payload.user_id)
    except ImpersonationTargetError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in tenant")

    token = create_impersonation_token(str(member.user_id), str(current_user.id))
    return ImpersonateResponse(access_token=token, user_email=member.user.email)


def _to_plan_full(plan, tenant_count: int) -> PlanReadFull:
    full = PlanReadFull.model_validate(plan)
    full.tenant_count = tenant_count
    return full


@router.get("/plans", response_model=list[PlanReadFull])
async def admin_list_plans(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlanReadFull]:
    plans = await list_all_plans(db)
    counts = await count_org_tenants_per_plan(db)
    return [_to_plan_full(plan, counts.get(plan.id, 0)) for plan in plans]


@router.post("/plans", response_model=PlanReadFull, status_code=status.HTTP_201_CREATED)
async def admin_create_plan(
    payload: PlanCreate,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> PlanReadFull:
    try:
        plan = await create_plan(db, payload.model_dump())
    except PlanCodeTakenError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A plan with this code already exists")
    return _to_plan_full(plan, 0)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_plan(
    plan_id: uuid.UUID,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await delete_plan(db, plan_id)
    except PlanNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    except PlanInUseError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This plan has subscriptions. Deactivate it instead of deleting.",
        )


@router.patch("/plans/{plan_id}", response_model=PlanReadFull)
async def admin_update_plan(
    plan_id: uuid.UUID,
    payload: PlanUpdate,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> PlanReadFull:
    try:
        plan = await update_plan(db, plan_id, payload.model_dump(exclude_none=True))
    except PlanNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    counts = await count_org_tenants_per_plan(db)
    return _to_plan_full(plan, counts.get(plan.id, 0))


@router.get("/credit-rates", response_model=list[CreditRateRead])
async def admin_list_rates(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[CreditRateRead]:
    return await list_credit_rates(db)


@router.patch("/credit-rates/{rate_id}", response_model=CreditRateRead)
async def admin_update_rate(
    rate_id: uuid.UUID,
    payload: CreditRateUpdate,
    current_user: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> CreditRateRead:
    try:
        return await update_credit_rate(db, rate_id, payload.rate_bdt, current_user.email)
    except CreditRateNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit rate not found")


# ── Wallet oversight ─────────────────────────────────────────────────────────


@router.get("/wallets", response_model=list[WalletAdminRead])
async def admin_list_wallets(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[WalletAdminRead]:
    rows = await list_org_wallets(db)
    return [
        WalletAdminRead(
            org_id=wallet.organization_id,
            org_name=org_name,
            balance_bdt=round(wallet.balance_paisa / 100, 2),
            balance_paisa=wallet.balance_paisa,
            low_balance_threshold_bdt=wallet.low_balance_threshold_paisa / 100,
            is_low=wallet.balance_paisa < wallet.low_balance_threshold_paisa,
            updated_at=wallet.updated_at,
        )
        for wallet, org_name in rows
    ]


@router.get("/wallets/{org_id}/transactions", response_model=list[WalletTransactionRead])
async def admin_wallet_transactions(
    org_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[WalletTransactionRead]:
    return await list_transactions(db, org_id, limit, offset)


@router.post("/wallets/{org_id}/adjust", response_model=WalletAdjustResponse)
async def admin_adjust_wallet(
    org_id: uuid.UUID,
    payload: WalletAdjustRequest,
    current_user: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> WalletAdjustResponse:
    amount_paisa = int(round(payload.amount_bdt * 100))
    txn = await admin_adjust(db, org_id, amount_paisa, payload.note, current_user.email)
    await db.commit()
    return WalletAdjustResponse(balance_after_bdt=round(txn.balance_after_paisa / 100, 2))


# ── Revenue ──────────────────────────────────────────────────────────────────


@router.get("/revenue/summary", response_model=RevenueSummary)
async def revenue_summary(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> RevenueSummary:
    return RevenueSummary(**await get_revenue_summary(db))


@router.get("/revenue/transactions", response_model=list[WalletTransactionFeedRead])
async def revenue_recent_transactions(
    limit: int = 50,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[WalletTransactionFeedRead]:
    rows = await list_recent_wallet_transactions(db, limit)
    return [
        WalletTransactionFeedRead(
            id=txn.id,
            org_name=org_name,
            type=txn.type,
            amount_bdt=round(txn.amount_paisa / 100, 2),
            service=txn.service,
            created_at=txn.created_at,
        )
        for txn, org_name in rows
    ]


# ── Integration hub (platform service credentials) ──────────────────────────


def _svc_read(s: PlatformService) -> PlatformServiceRead:
    return PlatformServiceRead(
        id=s.id,
        code=s.code,
        name=s.name,
        category=s.category,
        description=s.description,
        docs_url=s.docs_url,
        cost_model=s.cost_model,
        est_monthly_usd=float(s.est_monthly_usd or 0),
        is_enabled=s.is_enabled,
        is_live=s.is_live,
        has_credentials=s.credentials_enc is not None,
        last_tested_at=s.last_tested_at,
        last_test_ok=s.last_test_ok,
        last_test_error=s.last_test_error,
    )


async def _get_service_or_404(db: AsyncSession, code: str) -> PlatformService:
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == code))
    if svc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    return svc


@router.get("/integrations", response_model=list[PlatformServiceRead])
async def list_integrations(
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlatformServiceRead]:
    svcs = await db.scalars(select(PlatformService).order_by(PlatformService.category))
    return [_svc_read(s) for s in svcs]


@router.patch("/integrations/{code}", response_model=PlatformServiceRead)
async def update_integration(
    code: str,
    payload: PlatformServiceUpdate,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> PlatformServiceRead:
    svc = await _get_service_or_404(db, code)
    if payload.credentials:
        svc.credentials_enc = encrypt_creds(payload.credentials)
    if payload.is_enabled is not None:
        svc.is_enabled = payload.is_enabled
    if payload.is_live is not None:
        svc.is_live = payload.is_live
    if payload.est_monthly_usd is not None:
        svc.est_monthly_usd = payload.est_monthly_usd
    await db.commit()
    await db.refresh(svc)
    return _svc_read(svc)


@router.post("/integrations/{code}/test", response_model=IntegrationTestResult)
async def test_integration(
    code: str,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationTestResult:
    svc = await _get_service_or_404(db, code)
    if not svc.credentials_enc:
        return IntegrationTestResult(ok=False, message="No credentials stored", tested_at=None)

    creds = decrypt_creds(svc.credentials_enc)
    ok, message = await test_service(code, creds)
    now = datetime.now(timezone.utc)
    svc.last_tested_at = now
    svc.last_test_ok = ok
    svc.last_test_error = message if not ok else None
    await db.commit()
    return IntegrationTestResult(ok=ok, message=message, tested_at=now)


class SendTestEmailRequest(BaseModel):
    to_email: str


@router.post("/integrations/amazon_ses/send-test", response_model=IntegrationTestResult)
async def send_ses_test_email(
    payload: SendTestEmailRequest,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationTestResult:
    """Sends a real email through the saved SES credentials, from the Default From Email."""
    from app.integrations.email_delivery import EmailSendError, send_via_ses

    svc = await _get_service_or_404(db, "amazon_ses")
    now = datetime.now(timezone.utc)
    if not svc.credentials_enc:
        return IntegrationTestResult(ok=False, message="Save the AWS credentials first.", tested_at=now)
    c = decrypt_creds(svc.credentials_enc)
    sender = (c.get("default_from_email") or "").strip()
    if not sender:
        return IntegrationTestResult(ok=False, message="Set a Default From Email (an address on a domain verified in SES) before sending a test.", tested_at=now)
    to = payload.to_email.strip()
    if "@" not in to:
        return IntegrationTestResult(ok=False, message="Enter a valid recipient email address.", tested_at=now)
    cfg = {
        "access_key_id": c.get("access_key_id", "").strip(), "secret_access_key": c.get("secret_access_key", "").strip(),
        "region": (c.get("region") or "us-east-1").strip(), "configuration_set": (c.get("configuration_set") or "").strip(),
    }
    try:
        mid = await send_via_ses(
            cfg, to_email=to, subject="LeadBangla — Amazon SES test email",
            html_body="<p>This is a real test email sent through <strong>Amazon SES</strong> from the LeadBangla admin panel.</p><p>If you received it, your SES connection works.</p>",
            from_email=sender, from_name="LeadBangla",
        )
    except EmailSendError as e:
        return IntegrationTestResult(ok=False, message=str(e), tested_at=now)
    return IntegrationTestResult(ok=True, message=f"Email accepted by Amazon SES for {to} (message id {mid}). Check the inbox (and spam).", tested_at=now)


class SendTestSmsRequest(BaseModel):
    to: str
    message: str = "LeadBangla test SMS. If you can read this, your SMS gateway works."


@router.post("/integrations/sslwireless/send-test", response_model=IntegrationTestResult)
async def send_sslwireless_test_sms(
    payload: SendTestSmsRequest,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationTestResult:
    """Sends one real SMS through the saved SSL Wireless token, using the
    platform default Sender ID. Works before the integration is switched live."""
    from app.integrations.sslwireless import sslwireless_client
    from app.core.config import settings as app_settings

    svc = await _get_service_or_404(db, "sslwireless")
    now = datetime.now(timezone.utc)
    if not svc.credentials_enc:
        return IntegrationTestResult(ok=False, message="Save the SSL Wireless API token first.", tested_at=now)
    creds = decrypt_creds(svc.credentials_enc)
    try:
        mid = await sslwireless_client.send_sms_with_creds(
            creds, to=payload.to, message=payload.message, sender_id=app_settings.sslwireless_sender_id
        )
    except ValueError as e:
        return IntegrationTestResult(ok=False, message=str(e), tested_at=now)
    except Exception as e:  # gateway rejected it or was unreachable
        return IntegrationTestResult(ok=False, message=f"Gateway error: {e}", tested_at=now)
    return IntegrationTestResult(
        ok=True, tested_at=now,
        message=f"Accepted by SSL Wireless for {payload.to} using Sender ID “{app_settings.sslwireless_sender_id}” (id {mid}). Check the phone.",
    )


@router.delete("/integrations/{code}/credentials", status_code=status.HTTP_204_NO_CONTENT)
async def clear_credentials(
    code: str,
    _: User = Depends(get_current_internal_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = await _get_service_or_404(db, code)
    svc.credentials_enc = None
    svc.is_live = False
    await db.commit()
