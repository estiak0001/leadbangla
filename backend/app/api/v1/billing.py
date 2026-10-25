import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_membership, get_current_user
from app.integrations.sslcommerz import sslcommerz_client
from app.models.contact import Contact
from app.models.landing_page import LandingPage
from app.models.organization import OrganizationMember
from app.models.user import User
from app.models.workflow import Workflow
from app.services.seo_service import count_audits_this_month
from app.schemas.billing import (
    CreditRateRead,
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
from app.services.billing_service import (
    PlanNotFoundError,
    SubscriptionNotFoundError,
    cancel_subscription,
    create_pending_subscription,
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
    get_pending_topup,
    list_transactions,
)

router = APIRouter(prefix="/billing", tags=["billing"])

# Minimum top-up: 100 BDT = 10,000 paisa
TOPUP_MIN_PAISA = 10_000


@router.get("/plans", response_model=list[PlanPublic])
async def get_plans(db: AsyncSession = Depends(get_db)) -> list[PlanPublic]:
    return await list_active_plans(db)


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

    subscription = await create_pending_subscription(db, current_user.id, plan)

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

    await mark_subscription_active(db, str(tran_id), str(val_id))
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


@router.get("/credit-rates", response_model=list[CreditRateRead])
async def public_credit_rates(db: AsyncSession = Depends(get_db)) -> list[CreditRateRead]:
    return await list_credit_rates(db)


@router.get("/fake-checkout", response_class=HTMLResponse)
async def fake_checkout(tran_id: str, db: AsyncSession = Depends(get_db)) -> HTMLResponse:
    subscription = await get_subscription_by_tran_id(db, tran_id)
    if subscription is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown transaction")

    html = f"""
    <html>
      <body>
        <h1>Sandbox checkout (fake gateway)</h1>
        <p>Standing in for SSLCommerz's sandbox until real credentials are configured.</p>
        <p>Plan: {subscription.plan.name} &mdash; {subscription.plan.price_bdt} BDT/{subscription.plan.billing_interval}</p>
        <form method="post" action="/api/v1/billing/fake-checkout/complete">
          <input type="hidden" name="tran_id" value="{tran_id}" />
          <button type="submit">Simulate successful payment</button>
        </form>
        <a href="{settings.app_base_url}/billing/cancel?status=cancelled">Cancel</a>
      </body>
    </html>
    """
    return HTMLResponse(html)


@router.post("/fake-checkout/complete")
async def fake_checkout_complete(request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    form = await request.form()
    tran_id = form.get("tran_id")
    if not tran_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tran_id")

    val_id = f"FAKE-{uuid.uuid4().hex}"
    await mark_subscription_active(db, str(tran_id), val_id)
    return RedirectResponse(
        url=f"{settings.app_base_url}/billing/success?tran_id={tran_id}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


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
        fake_checkout_path="/api/v1/billing/wallet/fake-checkout",
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


@router.get("/wallet/fake-checkout", response_class=HTMLResponse)
async def wallet_fake_checkout(tran_id: str, db: AsyncSession = Depends(get_db)) -> HTMLResponse:
    try:
        pending = await get_pending_topup(db, tran_id)
    except TopUpNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown transaction")

    html = f"""
    <html>
      <body>
        <h1>Sandbox wallet top-up</h1>
        <p>Amount: {pending.amount_paisa / 100:.2f} BDT</p>
        <form method="post" action="/api/v1/billing/wallet/fake-checkout/complete">
          <input type="hidden" name="tran_id" value="{tran_id}" />
          <button type="submit">Simulate successful top-up</button>
        </form>
        <a href="{settings.app_base_url}/billing?tab=wallet&topup=cancelled">Cancel</a>
      </body>
    </html>
    """
    return HTMLResponse(html)


@router.post("/wallet/fake-checkout/complete")
async def wallet_fake_complete(request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    form = await request.form()
    tran_id = form.get("tran_id")
    if not tran_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tran_id")

    try:
        await complete_topup(db, str(tran_id))
    except TopUpNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown transaction")

    return RedirectResponse(
        url=f"{settings.app_base_url}/billing?tab=wallet&topup=success",
        status_code=status.HTTP_303_SEE_OTHER,
    )


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
        custom_domain=plan.custom_domain if plan else False,
        priority_support=plan.priority_support if plan else False,
        sms=ResourceUsage(used=sms_used, limit=plan.sms_monthly_limit if plan else 0),
        sms_enabled=plan.sms_enabled if plan else False,
        masking_allowed=plan.masking_allowed if plan else False,
        whatsapp_enabled=plan.whatsapp_enabled if plan else False,
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
