import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.contact import Contact
from app.models.enums import SmsChannel
from app.models.organization import OrganizationMember
from app.schemas.sms import (
    OptInUpdate,
    OrgSmsSettingsRead,
    OrgSmsSettingsUpdate,
    SmsCampaignCreate,
    SmsCampaignEventsRead,
    SmsCampaignRead,
    SmsDashboardRead,
    SmsEventRead,
    SmsInboundRead,
    SmsSkipEventRead,
)
from app.services.sms_service import (
    SmsCampaignAlreadySentError,
    SmsCampaignNotFoundError,
    SegmentRequiredError,
    create_sms_campaign,
    event_counts,
    get_org_sms_settings,
    get_sms_campaign,
    get_sms_dashboard,
    get_sms_masking_setup_fee_bdt,
    list_campaign_events,
    list_inbound_messages,
    list_sms_campaigns,
    list_sms_history,
    mark_sms_campaign_sending,
    update_contact_opt_in,
    update_org_sms_sender_id,
)
from app.services.wallet_service import InsufficientBalanceError
from app.workers.tasks import send_sms_campaign_task

router = APIRouter(tags=["sms"])


async def _to_read(db, campaign) -> SmsCampaignRead:
    counts = await event_counts(db, campaign.id)
    return SmsCampaignRead(
        id=campaign.id,
        name=campaign.name,
        channel=campaign.channel.value,
        status=campaign.status.value,
        segment_id=campaign.segment_id,
        sender_id=campaign.sender_id,
        message_body=campaign.message_body,
        wa_template=campaign.wa_template,
        sent_at=campaign.sent_at,
        created_at=campaign.created_at,
        sent_count=counts["sent"],
        failed_count=counts["failed"],
        skipped_count=counts["skipped"],
    )


# ── SMS campaigns ─────────────────────────────────────────────────────────────

sms_router = APIRouter(prefix="/sms/campaigns")


@sms_router.get("", response_model=list[SmsCampaignRead])
async def get_sms_campaigns(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SmsCampaignRead]:
    campaigns = await list_sms_campaigns(db, membership.organization_id)
    return [await _to_read(db, c) for c in campaigns]


@sms_router.post("", response_model=SmsCampaignRead, status_code=status.HTTP_201_CREATED)
async def create_sms_campaign_route(
    payload: SmsCampaignCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SmsCampaignRead:
    try:
        channel = SmsChannel(payload.channel)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown channel: {payload.channel}")
    from app.integrations import whatsapp_gateway  # noqa: PLC0415

    if channel == SmsChannel.WHATSAPP and await whatsapp_gateway.mode_for(db, membership.organization_id) == "meta" and not payload.wa_template:
        raise HTTPException(status_code=400, detail="Pick an approved WhatsApp template. WhatsApp only delivers business-started messages that use one.")
    try:
        campaign = await create_sms_campaign(
            db,
            membership.organization_id,
            name=payload.name,
            segment_id=payload.segment_id,
            channel=channel,
            message_body=payload.message_body,
            sender_id=payload.sender_id,
            wa_template=payload.wa_template.model_dump() if payload.wa_template and channel == SmsChannel.WHATSAPP else None,
        )
    except SegmentRequiredError:
        raise HTTPException(status_code=404, detail="Segment not found")
    return await _to_read(db, campaign)


@sms_router.get("/{campaign_id}", response_model=SmsCampaignRead)
async def get_sms_campaign_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SmsCampaignRead:
    try:
        campaign = await get_sms_campaign(db, membership.organization_id, campaign_id)
    except SmsCampaignNotFoundError:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return await _to_read(db, campaign)


@sms_router.post("/{campaign_id}/send", response_model=SmsCampaignRead)
async def send_sms_campaign_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SmsCampaignRead:
    """Flips DRAFT→SENDING and enqueues the Celery task — never sends inline."""
    try:
        existing = await get_sms_campaign(db, membership.organization_id, campaign_id)
    except SmsCampaignNotFoundError:
        raise HTTPException(status_code=404, detail="Campaign not found")
    from app.services import sms_plan  # noqa: PLC0415

    try:
        await sms_plan.check_can_send(db, membership.organization_id, existing)
    except sms_plan.SmsPlanError as e:
        raise HTTPException(status_code=402, detail=str(e))
    if existing.channel == SmsChannel.WHATSAPP:
        from app.core.service_creds import get_live_creds  # noqa: PLC0415
        from app.models.organization import Organization  # noqa: PLC0415

        org = await db.get(Organization, membership.organization_id)
        from app.integrations import whatsapp_gateway as wg  # noqa: PLC0415

        ok, why = await wg.availability(db, membership.organization_id)
        if not ok:
            raise HTTPException(status_code=409, detail=why)
        if await wg.mode(db) == "provider" and not (org and org.whatsapp_number_approved):
            raise HTTPException(
                status_code=409,
                detail="Your WhatsApp business number isn't approved yet. Open WhatsApp → Setup, submit your documents, and wait for approval.",
            )
    try:
        campaign = await mark_sms_campaign_sending(db, membership.organization_id, campaign_id)
    except SmsCampaignNotFoundError:
        raise HTTPException(status_code=404, detail="Campaign not found")
    except SmsCampaignAlreadySentError:
        raise HTTPException(status_code=409, detail="Campaign already sent")

    send_sms_campaign_task.delay(str(membership.organization_id), str(campaign_id))
    return await _to_read(db, campaign)


@sms_router.get("/{campaign_id}/events", response_model=SmsCampaignEventsRead)
async def get_sms_campaign_events_route(
    campaign_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SmsCampaignEventsRead:
    try:
        events, skips = await list_campaign_events(db, membership.organization_id, campaign_id)
    except SmsCampaignNotFoundError:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return SmsCampaignEventsRead(
        sent_and_failed=[
            SmsEventRead(
                id=e.id, campaign_id=e.sms_campaign_id, campaign_name=name, phone=e.phone,
                type=e.type.value, gateway_message_id=e.gateway_message_id, error=e.error, occurred_at=e.occurred_at,
            )
            for e, name in events
        ],
        skipped=[
            SmsSkipEventRead(
                id=s.id, campaign_id=s.sms_campaign_id, campaign_name=name, phone=s.phone,
                occurred_at=s.occurred_at,
            )
            for s, name in skips
        ],
    )


# ── Dashboard / send history / inbound messages ───────────────────────────────


@router.get("/sms/dashboard", response_model=SmsDashboardRead)
async def get_sms_dashboard_route(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SmsDashboardRead:
    return SmsDashboardRead(**await get_sms_dashboard(db, membership.organization_id))


@router.get("/sms/history", response_model=list[SmsEventRead])
async def get_sms_history_route(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SmsEventRead]:
    rows = await list_sms_history(db, membership.organization_id)
    return [
        SmsEventRead(
            id=e.id, campaign_id=e.sms_campaign_id, campaign_name=name, phone=e.phone,
            type=e.type.value, gateway_message_id=e.gateway_message_id, error=e.error, occurred_at=e.occurred_at,
        )
        for e, name in rows
    ]


@router.get("/sms/inbound", response_model=list[SmsInboundRead])
async def get_sms_inbound_route(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SmsInboundRead]:
    messages = await list_inbound_messages(db, membership.organization_id)
    out = []
    for m in messages:
        contact_name = None
        if m.contact_id:
            contact = await db.get(Contact, m.contact_id)
            if contact:
                contact_name = " ".join(filter(None, [contact.first_name, contact.last_name])) or None
        out.append(
            SmsInboundRead(
                id=m.id, from_phone=m.from_phone, to_sender_id=m.to_sender_id, body=m.body,
                contact_id=m.contact_id, contact_name=contact_name, received_at=m.received_at,
            )
        )
    return out


# ── Org-level default masking sender ID ───────────────────────────────────────

sms_settings_router = APIRouter(prefix="/sms/settings")


@sms_settings_router.get("", response_model=OrgSmsSettingsRead)
async def get_sms_settings(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> OrgSmsSettingsRead:
    sender_id, suggested, approved = await get_org_sms_settings(db, membership.organization_id)
    fee = await get_sms_masking_setup_fee_bdt(db)
    return OrgSmsSettingsRead(
        sms_sender_id=sender_id, suggested_sender_id=suggested, approved=approved, setup_fee_bdt=fee
    )


@sms_settings_router.get("/entitlement")
async def sms_entitlement(membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    """What the org's plan allows: SMS/WhatsApp on or off, monthly cap, usage, masking."""
    from app.services import sms_plan  # noqa: PLC0415

    return await sms_plan.entitlement(db, membership.organization_id)


@sms_settings_router.put("", response_model=OrgSmsSettingsRead)
async def update_sms_settings(
    payload: OrgSmsSettingsUpdate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> OrgSmsSettingsRead:
    # Self-service only proposes a Sender ID — see update_org_sms_sender_id,
    # which resets approval since a changed value needs re-verifying with
    # the aggregator. Only platform admins can grant approval (below).
    from app.services import sms_plan  # noqa: PLC0415

    if payload.sms_sender_id and not (await sms_plan.entitlement(db, membership.organization_id))["masking_allowed"]:
        raise HTTPException(status_code=402, detail="Your plan doesn't include a masking Sender ID. Upgrade to request one.")
    try:
        sender_id = await update_org_sms_sender_id(db, membership.organization_id, payload.sms_sender_id)
    except InsufficientBalanceError:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient wallet balance for the Sender ID setup fee",
        )
    from app.services.verification_service import sync_sender_request  # keeps the admin queue in step

    await sync_sender_request(db, membership.organization_id, sender_id)
    _, suggested, approved = await get_org_sms_settings(db, membership.organization_id)
    fee = await get_sms_masking_setup_fee_bdt(db)
    return OrgSmsSettingsRead(
        sms_sender_id=sender_id, suggested_sender_id=suggested, approved=approved, setup_fee_bdt=fee
    )


# ── Contact opt-in management ─────────────────────────────────────────────────

contacts_optin_router = APIRouter(prefix="/contacts")


@contacts_optin_router.patch("/{contact_id}/opt-in")
async def update_opt_in(
    contact_id: uuid.UUID,
    payload: OptInUpdate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        contact = await update_contact_opt_in(
            db,
            membership.organization_id,
            contact_id,
            sms_opt_in=payload.sms_opt_in,
            whatsapp_opt_in=payload.whatsapp_opt_in,
            user_id=membership.user_id,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"sms_opt_in": contact.sms_opt_in, "whatsapp_opt_in": contact.whatsapp_opt_in}


# ── WhatsApp templates (Meta Cloud API) ───────────────────────────────────────

whatsapp_router = APIRouter(prefix="/whatsapp")


@whatsapp_router.get("/templates")
async def whatsapp_templates(
    membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db),
) -> dict:
    """What the composer needs: is Meta live (templates required), and which approved templates exist."""
    from app.integrations import meta_whatsapp  # noqa: PLC0415
    from app.integrations import whatsapp_gateway  # noqa: PLC0415

    own = await whatsapp_gateway.own_creds(db, membership.organization_id)
    if own:
        if not own.get("waba_id"):
            return {"mode": "meta", "own_account": True, "templates": [], "error": "Add your WhatsApp Business Account ID in WhatsApp → Setup to list your templates."}
        try:
            return {"mode": "meta", "own_account": True, "templates": await meta_whatsapp.list_templates(own)}
        except meta_whatsapp.MetaWhatsAppError as e:
            return {"mode": "meta", "own_account": True, "templates": [], "error": str(e)}
    creds = await whatsapp_gateway.meta_creds(db)
    if creds is None:
        return {"mode": await whatsapp_gateway.mode(db), "templates": []}
    if not creds.get("waba_id"):
        return {"mode": "meta", "templates": [], "error": "The platform's WhatsApp Business Account ID isn't set yet."}
    try:
        from app.services import whatsapp_template_service as wts  # noqa: PLC0415

        owners = await wts.owned_names(db)   # a template requested by another customer is theirs alone
        mine = [t for t in await meta_whatsapp.list_templates(creds) if owners.get(t["name"], membership.organization_id) == membership.organization_id]
        return {"mode": "meta", "templates": mine}
    except meta_whatsapp.MetaWhatsAppError as e:
        return {"mode": "meta", "templates": [], "error": str(e)}


class TemplateRequestBody(BaseModel):
    label: str = Field(min_length=2, max_length=100)
    language: str = "en"
    category: str = "utility"
    body: str = Field(min_length=1, max_length=1100)
    examples: list[str] = Field(default_factory=list, max_length=10)


@whatsapp_router.get("/template-requests")
async def list_template_requests(membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> list[dict]:
    from app.services import whatsapp_template_service as wts  # noqa: PLC0415

    return [wts.read(r) for r in await wts.list_for_org(db, membership.organization_id)]


@whatsapp_router.post("/template-requests", status_code=201)
async def create_template_request(body: TemplateRequestBody, membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    from app.services import whatsapp_template_service as wts  # noqa: PLC0415

    try:
        return wts.read(await wts.create(db, membership.organization_id, membership.user_id, **body.model_dump()))
    except wts.TemplateError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


@whatsapp_router.delete("/template-requests/{request_id}")
async def cancel_template_request(request_id: uuid.UUID, membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    from app.services import whatsapp_template_service as wts  # noqa: PLC0415

    try:
        return wts.read(await wts.cancel(db, membership.organization_id, request_id))
    except wts.TemplateError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


class OwnAccountBody(BaseModel):
    access_token: str | None = Field(default=None, max_length=600)
    phone_number_id: str = Field(min_length=5, max_length=40)
    waba_id: str | None = Field(default=None, max_length=40)
    app_secret: str | None = Field(default=None, max_length=100)
    verify_token: str | None = Field(default=None, max_length=100)


@whatsapp_router.get("/sending-from")
async def whatsapp_sending_from(membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    """Which number the customer's WhatsApp messages come from, and whether WhatsApp is connected at all."""
    from app.integrations import whatsapp_gateway  # noqa: PLC0415
    from app.services import sms_plan  # noqa: PLC0415

    out = await whatsapp_gateway.sending_from(db, membership.organization_id)
    ent = await sms_plan.entitlement(db, membership.organization_id)
    return {**out, "monthly_limit": ent["whatsapp_monthly_limit"], "used": ent["whatsapp_used"], "remaining": ent["whatsapp_remaining"]}


@whatsapp_router.get("/own-account")
async def own_account_status(membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    from app.services import whatsapp_own_account_service as oa  # noqa: PLC0415

    return await oa.status(db, membership.organization_id)


@whatsapp_router.put("/own-account")
async def connect_own_account(body: OwnAccountBody, membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    from app.services import sms_plan  # noqa: PLC0415
    from app.services import whatsapp_own_account_service as oa  # noqa: PLC0415

    if not (await sms_plan.entitlement(db, membership.organization_id))["whatsapp_enabled"]:
        raise HTTPException(status_code=402, detail="WhatsApp isn't included in your plan. Upgrade to set it up.")
    try:
        return await oa.connect(db, membership.organization_id, **body.model_dump())
    except oa.OwnAccountError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # verification service errors
        from app.services.verification_service import VerificationError  # noqa: PLC0415

        if isinstance(e, VerificationError):
            raise HTTPException(status_code=400, detail=str(e))
        raise


@whatsapp_router.delete("/own-account")
async def disconnect_own_account(membership: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)) -> dict:
    from app.services import whatsapp_own_account_service as oa  # noqa: PLC0415

    return await oa.disconnect(db, membership.organization_id)
