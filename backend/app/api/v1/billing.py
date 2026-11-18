import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_membership, get_current_user
from app.integrations.sslcommerz import sslcommerz_client
from app.services.feature_flags import is_on
from app.services.payment_options import online_available
from app.models.contact import Contact
from app.models.landing_page import LandingPage
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
from app.models.workflow import Workflow
from app.services.seo_service import count_audits_this_month
from app.schemas.billing import (
    CreditRateRead,
    InvoiceDetailRead,
    InvoiceRead,
    NotificationPrefsRead,
    NotificationPrefsUpdate,
    PlanPublic,
    PlanRead,
    PlanUsageRead,
    ResourceUsage,
    SubscribeRequest,
    SubscribeResponse,
    SubscriptionRead,
    TopUpRequest,
    TopUpResponse,
    WalletRead,
    WalletTransactionRead,
)
from app.models.enums import InvoiceStatus
from app.services import invoice_service
from app.services.billing_service import (
    InvoiceNotFoundError,
    PlanNotFoundError,
    SubscriptionNotFoundError,
    cancel_subscription,
    create_pending_subscription,
    org_id_for_user,
    get_latest_subscription_for_user,
    get_plan,
    get_subscription_by_tran_id,
    list_active_plans,
    mark_subscription_active,
)
from app.services.campaign_service import count_emails_this_month
from app.services.notification_service import get_or_create_settings, update_settings
from app.services.plan_service import get_org_plan, list_credit_rates
from app.services.wallet_service import (
    TopUpNotFoundError,
    complete_topup,
    create_pending_topup,
    get_balance,
    list_transactions,
)

router = APIRouter(prefix="/billing", tags=["billing"])

# Minimum top-up: 100 BDT = 10,000 paisa
TOPUP_MIN_PAISA = 10_000


@router.get("/plans", response_model=list[PlanPublic])
async def get_plans(db: AsyncSession = Depends(get_db)) -> list[PlanPublic]:
    from app.services.feature_flags import feature_map  # noqa: PLC0415

    flags = await feature_map(db)
    out = []
    for p in await list_active_plans(db):
        item = PlanPublic.model_validate(p)
        if flags.get("whatsapp") is False:
            item.whatsapp_enabled, item.whatsapp_monthly_limit = False, 0
        if flags.get("sms") is False:
            item.sms_enabled, item.sms_monthly_limit, item.masking_allowed = False, 0, False
        out.append(item)
    return out


@router.post("/subscribe", response_model=SubscribeResponse)
async def subscribe(
    payload: SubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscribeResponse:
    try:
        plan = await get_plan(db, payload.plan_id)
    except PlanNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if plan.price_bdt > 0 and not await online_available(db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Online payment isn't available right now. Please pay manually instead.")

    org_id = await org_id_for_user(db, current_user.id)
    if payload.invoice_id is not None:
        invoice = await invoice_service.get_invoice_for_org(db, org_id, payload.invoice_id)
        if invoice is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That invoice could not be found")
        if invoice.status != InvoiceStatus.DUE:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That invoice is no longer due for payment")

    subscription = await create_pending_subscription(db, current_user.id, plan, org_id, renewal_invoice_id=payload.invoice_id)

    if plan.price_bdt == 0:
        # Free tier: nothing to pay, so skip the gateway and activate straight away.
        await mark_subscription_active(db, subscription.tran_id, "free")
        return SubscribeResponse(
            subscription_id=subscription.id,
            checkout_url=f"{settings.app_base_url}/billing/success?tran_id={subscription.tran_id}",
        )

    checkout_url = await sslcommerz_client.init_session(
        db,
        tran_id=subscription.tran_id,
        amount_bdt=plan.price_bdt,
        customer_email=current_user.email,
        success_url=f"{settings.app_base_url}/billing/success?tran_id={subscription.tran_id}",
        fail_url=f"{settings.app_base_url}/billing/cancel?status=failed",
        cancel_url=f"{settings.app_base_url}/billing/cancel?status=cancelled",
        ipn_url=f"{settings.backend_public_url}/v1/billing/ipn",
        product_name=f"LeadBangla {plan.name} subscription",
    )
    return SubscribeResponse(subscription_id=subscription.id, checkout_url=checkout_url)


@router.post("/ipn")
async def ipn(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    form = await request.form()
    tran_id = form.get("tran_id")
    val_id = form.get("val_id")
    if not tran_id or not val_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tran_id/val_id")

    is_valid = await sslcommerz_client.validate_transaction(db, str(val_id))
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid transaction")

    try:
        await mark_subscription_active(db, str(tran_id), str(val_id))
    except InvoiceNotFoundError:
        # The renewal invoice this payment was for got voided/settled in the gap between
        # checkout and this webhook (e.g. the customer cancelled in the meantime).
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This payment's invoice is no longer payable")
    return {"status": "ok"}


@router.get("/me", response_model=SubscriptionRead | None)
async def my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionRead | None:
    return await get_latest_subscription_for_user(db, current_user.id)


@router.post("/cancel", response_model=SubscriptionRead)
async def cancel_my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionRead:
    try:
        return await cancel_subscription(db, current_user.id)
    except SubscriptionNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active subscription")


@router.get("/invoices", response_model=list[InvoiceRead])
async def my_invoices(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[InvoiceRead]:
    return await invoice_service.list_invoices_for_org(db, membership.organization_id)


@router.get("/invoices/{invoice_id}/data", response_model=InvoiceDetailRead)
async def invoice_detail(
    invoice_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> InvoiceDetailRead:
    """Flat data for the client-side PDF renderer (lib/pdfInvoice.ts) -- drawn with
    jsPDF's own text/line primitives, not an HTML-to-canvas screenshot, so there's
    no CSS-rendering fidelity to get wrong."""
    invoice = await invoice_service.get_invoice_for_org(db, membership.organization_id, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    org = await db.get(Organization, invoice.organization_id)
    from app.services.company_settings_service import get_settings as get_company_settings  # noqa: PLC0415

    company = await get_company_settings(db)
    bill_to_lines = list(filter(None, [
        org.address if org else None,
        ", ".join(filter(None, [org.city if org else None, org.country if org else None])) or None,
        org.contact_email if org else None,
    ]))
    return InvoiceDetailRead(
        invoice_number=invoice.invoice_number,
        status=invoice.status,
        amount_bdt=invoice.amount_bdt,
        plan_name=invoice.plan.name,
        period_start=invoice.period_start,
        period_end=invoice.period_end,
        issued_at=invoice.issued_at,
        due_at=invoice.due_at,
        paid_at=invoice.paid_at,
        payment_method=invoice.payment_method,
        company_name=company.company_name,
        company_address=company.address,
        company_support_email=company.support_email,
        bill_to_name=(org.display_name or org.name) if org else "—",
        bill_to_lines=bill_to_lines,
    )


@router.get("/credit-rates", response_model=list[CreditRateRead])
async def public_credit_rates(db: AsyncSession = Depends(get_db)) -> list[CreditRateRead]:
    return await list_credit_rates(db)


# ── Credit wallet ──────────────────────────────────────────────────────────────


@router.get("/wallet", response_model=WalletRead)
async def wallet_balance(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> WalletRead:
    balance_paisa = await get_balance(db, membership.organization_id)
    return WalletRead(balance_paisa=balance_paisa, balance_bdt=round(balance_paisa / 100, 2))


@router.post("/wallet/topup", response_model=TopUpResponse)
async def initiate_topup(
    payload: TopUpRequest,
    user: User = Depends(get_current_user),
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> TopUpResponse:
    amount_paisa = int(payload.amount_bdt * 100)
    if amount_paisa < TOPUP_MIN_PAISA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Minimum top-up is {TOPUP_MIN_PAISA // 100} BDT"
        )

    if not await online_available(db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Online payment isn't available right now.")

    pending = await create_pending_topup(db, membership.organization_id, amount_paisa)

    checkout_url = await sslcommerz_client.init_session(
        db,
        tran_id=pending.tran_id,
        amount_bdt=int(payload.amount_bdt),
        customer_email=user.email,
        success_url=f"{settings.app_base_url}/billing?tab=wallet&topup=success",
        fail_url=f"{settings.app_base_url}/billing?tab=wallet&topup=failed",
        cancel_url=f"{settings.app_base_url}/billing?tab=wallet&topup=cancelled",
        ipn_url=f"{settings.backend_public_url}/v1/billing/wallet/ipn",
        product_name="LeadBangla Credit Top-Up",
    )
    return TopUpResponse(tran_id=pending.tran_id, checkout_url=checkout_url)


@router.post("/wallet/ipn")
async def wallet_ipn(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    form = await request.form()
    tran_id = form.get("tran_id")
    val_id = form.get("val_id")
    if not tran_id or not val_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tran_id/val_id")

    is_valid = await sslcommerz_client.validate_transaction(db, str(val_id))
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid transaction")

    try:
        await complete_topup(db, str(tran_id))
    except TopUpNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown top-up transaction")
    return {"status": "ok"}


@router.get("/wallet/usage-report")
async def wallet_usage_report(
    days: int = 30,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Where this organisation's wallet balance went over the last N days."""
    from app.services.usage_report import wallet_usage  # noqa: PLC0415

    return await wallet_usage(db, membership.organization_id, days)


@router.get("/wallet/transactions", response_model=list[WalletTransactionRead])
async def wallet_transactions(
    limit: int = 50,
    offset: int = 0,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[WalletTransactionRead]:
    return await list_transactions(db, membership.organization_id, limit, offset)


# ── Plan usage ───────────────────────────────────────────────────────────────


@router.get("/plan-usage", response_model=PlanUsageRead)
async def plan_usage(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> PlanUsageRead:
    org_id = membership.organization_id
    plan = await get_org_plan(db, org_id)

    contacts_count = await db.scalar(select(func.count(Contact.id)).where(Contact.organization_id == org_id)) or 0
    workflows_count = await db.scalar(select(func.count(Workflow.id)).where(Workflow.organization_id == org_id)) or 0
    lp_count = await db.scalar(select(func.count(LandingPage.id)).where(LandingPage.organization_id == org_id)) or 0
    team_count = (
        await db.scalar(select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org_id))
        or 0
    )
    emails_sent = await count_emails_this_month(db, org_id)
    from app.services.sms_plan import used_this_month as _sms_used  # noqa: PLC0415

    sms_used = await _sms_used(db, org_id)
    from app.models.enums import SmsChannel  # noqa: PLC0415
    from app.models.social import SocialAccount  # noqa: PLC0415

    wa_used = await _sms_used(db, org_id, SmsChannel.WHATSAPP)
    social_count = await db.scalar(select(func.count(SocialAccount.id)).where(SocialAccount.organization_id == org_id)) or 0
    today = datetime.now(timezone.utc).date()
    resets_on = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    wallet_balance_paisa = await get_balance(db, org_id)

    return PlanUsageRead(
        plan_name=plan.name if plan else "No plan",
        plan_price_bdt=plan.price_bdt if plan else 0,
        contacts=ResourceUsage(used=contacts_count, limit=plan.contacts_limit if plan else 0),
        emails_monthly=ResourceUsage(used=emails_sent, limit=plan.emails_monthly_limit if plan else 0),
        workflows=ResourceUsage(used=workflows_count, limit=plan.workflows_limit if plan else 0),
        landing_pages=ResourceUsage(used=lp_count, limit=plan.landing_pages_limit if plan else 0),
        team_members=ResourceUsage(used=team_count, limit=plan.team_members_limit if plan else 0),
        seo_credits=ResourceUsage(used=await count_audits_this_month(db, org_id), limit=plan.seo_credits_monthly if plan else 0),
        social_accounts=ResourceUsage(used=social_count, limit=plan.social_accounts_limit if plan else 0),
        whatsapp=ResourceUsage(used=wa_used, limit=plan.whatsapp_monthly_limit if plan else 0),
        period_resets_on=resets_on.isoformat(),
        custom_domain=plan.custom_domain if plan else False,
        priority_support=plan.priority_support if plan else False,
        sms=ResourceUsage(used=sms_used, limit=plan.sms_monthly_limit if plan else 0),
        sms_enabled=bool(plan and plan.sms_enabled) and await is_on(db, "sms"),
        masking_allowed=bool(plan and plan.masking_allowed) and await is_on(db, "sms"),
        whatsapp_enabled=bool(plan and plan.whatsapp_enabled) and await is_on(db, "whatsapp"),
        wallet_balance_bdt=round(wallet_balance_paisa / 100, 2),
        wallet_balance_paisa=wallet_balance_paisa,
    )


# ── Notification preferences ────────────────────────────────────────────────


@router.get("/notification-prefs", response_model=NotificationPrefsRead)
async def get_notification_prefs(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> NotificationPrefsRead:
    return await get_or_create_settings(db, membership.organization_id)


@router.patch("/notification-prefs", response_model=NotificationPrefsRead)
async def update_notification_prefs(
    payload: NotificationPrefsUpdate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> NotificationPrefsRead:
    return await update_settings(db, membership.organization_id, **payload.model_dump(exclude_none=True))
