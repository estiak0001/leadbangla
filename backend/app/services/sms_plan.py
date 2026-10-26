"""What an organisation's plan lets it do with SMS / WhatsApp."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.enums import SmsChannel, SmsEventType
from app.models.segment import Segment
from app.models.sms import SmsCampaign, SmsEvent
from app.schemas.audience import SegmentRule
from app.services.audience_service import build_segment_query
from app.services.feature_flags import is_on
from app.services.plan_service import get_org_plan


class SmsPlanError(Exception):
    """The plan doesn't allow this send. The message is shown to the customer."""


async def used_this_month(db: AsyncSession, org_id: uuid.UUID, channel: SmsChannel = SmsChannel.SMS) -> int:
    now = datetime.now(timezone.utc)
    return await db.scalar(
        select(func.count(SmsEvent.id))
        .join(SmsCampaign, SmsCampaign.id == SmsEvent.sms_campaign_id)
        .where(
            SmsEvent.organization_id == org_id,
            SmsEvent.type == SmsEventType.SENT,
            SmsCampaign.channel == channel,
            extract("year", SmsEvent.occurred_at) == now.year,
            extract("month", SmsEvent.occurred_at) == now.month,
        )
    ) or 0


async def entitlement(db: AsyncSession, org_id: uuid.UUID) -> dict:
    plan = await get_org_plan(db, org_id)
    used = await used_this_month(db, org_id)
    limit = plan.sms_monthly_limit if plan else 0
    wa_limit = plan.whatsapp_monthly_limit if plan else 0
    wa_used = await used_this_month(db, org_id, SmsChannel.WHATSAPP)
    return {
        "plan_name": plan.name if plan else None,
        "sms_enabled": bool(plan and plan.sms_enabled) and await is_on(db, "sms"),
        "whatsapp_enabled": bool(plan and plan.whatsapp_enabled) and await is_on(db, "whatsapp"),
        "masking_allowed": bool(plan and plan.masking_allowed),
        "monthly_limit": limit,
        "used": used,
        "remaining": None if limit == -1 else max(0, limit - used),
        "whatsapp_monthly_limit": wa_limit,
        "whatsapp_used": wa_used,
        "whatsapp_remaining": None if wa_limit == -1 else max(0, wa_limit - wa_used),
    }


async def count_recipients(db: AsyncSession, org_id: uuid.UUID, campaign: SmsCampaign) -> int:
    segment = await db.scalar(select(Segment).where(Segment.id == campaign.segment_id))
    if segment is None:
        return 0
    flag = Contact.sms_opt_in if campaign.channel == SmsChannel.SMS else Contact.whatsapp_opt_in
    q = build_segment_query(org_id, [SegmentRule(**r) for r in segment.rules]).where(
        Contact.phone.isnot(None), flag.is_(True)
    )
    return await db.scalar(select(func.count()).select_from(q.subquery())) or 0


async def check_can_send(db: AsyncSession, org_id: uuid.UUID, campaign: SmsCampaign) -> None:
    ent = await entitlement(db, org_id)
    if campaign.channel == SmsChannel.WHATSAPP:
        if not ent["whatsapp_enabled"]:
            raise SmsPlanError(f"WhatsApp isn't included in your {ent['plan_name'] or 'current'} plan. Upgrade to send WhatsApp messages.")
        left = ent["whatsapp_remaining"]
        if left is None:
            return
        if left <= 0:
            raise SmsPlanError(f"You've used all {ent['whatsapp_monthly_limit']:,} WhatsApp messages in your plan this month. Upgrade your plan or wait until next month.")
        needed = await count_recipients(db, org_id, campaign)
        if needed > left:
            raise SmsPlanError(
                f"This campaign needs {needed:,} WhatsApp messages but your plan has {left:,} left this month "
                f"(limit {ent['whatsapp_monthly_limit']:,}). Send to a smaller segment or upgrade your plan."
            )
        return
    if not ent["sms_enabled"]:
        raise SmsPlanError(f"SMS isn't included in your {ent['plan_name'] or 'current'} plan. Upgrade to send SMS.")
    if ent["remaining"] is None:
        return
    needed = await count_recipients(db, org_id, campaign)
    if ent["remaining"] <= 0:
        raise SmsPlanError(f"You've used all {ent['monthly_limit']:,} SMS in your plan this month. Upgrade your plan or wait until next month.")
    if needed > ent["remaining"]:
        raise SmsPlanError(
            f"This campaign needs {needed:,} SMS but your plan has {ent['remaining']:,} left this month "
            f"(limit {ent['monthly_limit']:,}). Send to a smaller segment or upgrade your plan."
        )
