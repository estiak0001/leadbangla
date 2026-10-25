"""Balance usage reports: where wallet money went, over a period."""
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.enums import SmsChannel, SmsEventType
from app.models.organization import Organization
from app.models.sms import SmsCampaign, SmsEvent
from app.models.wallet import WalletTransaction
from app.services.wallet_service import get_balance

SERVICE_LABELS = {
    "sms": "SMS", "whatsapp": "WhatsApp", "email_overage": "Email (over plan)", "seo_query": "SEO queries",
    "sms_masking_setup": "Sender ID setup",
}


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _bdt(paisa: int) -> float:
    return round(paisa / 100, 2)


async def wallet_usage(db: AsyncSession, org_id: uuid.UUID, days: int = 30) -> dict:
    """One organisation's wallet: money in, money spent per service, per day, and per campaign."""
    days = max(1, min(days, 365))
    rows = list(await db.scalars(
        select(WalletTransaction).where(WalletTransaction.organization_id == org_id, WalletTransaction.created_at >= _since(days))
        .order_by(WalletTransaction.created_at)
    ))
    topups = sum(r.amount_paisa for r in rows if r.type == "topup")
    manual = sum(r.amount_paisa for r in rows if r.type == "admin_adjustment")
    refunds = sum(r.amount_paisa for r in rows if r.type == "refund")
    spent_gross = -sum(r.amount_paisa for r in rows if r.type == "deduction")

    by_service: dict[str, dict] = defaultdict(lambda: {"paisa": 0, "units": 0})
    by_day: dict[str, dict] = defaultdict(lambda: {"spent": 0, "in": 0})
    by_ref: dict[tuple[str, str], int] = defaultdict(int)
    for r in rows:
        day = r.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
        if r.type in ("deduction", "refund"):
            net = -r.amount_paisa  # a refund is negative spend
            key = r.service or "other"
            by_service[key]["paisa"] += net
            if r.type == "deduction":
                by_service[key]["units"] += r.units_consumed or 0
            by_day[day]["spent"] += net
            if r.reference_id and key in ("sms", "whatsapp", "email_overage"):
                by_ref[(key, r.reference_id)] += net
        elif r.amount_paisa > 0:
            by_day[day]["in"] += r.amount_paisa

    # fill every day so the chart has no gaps
    start = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date()
    series = []
    for i in range(days):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({"date": d, "spent_bdt": _bdt(by_day[d]["spent"]), "added_bdt": _bdt(by_day[d]["in"])})

    # name the biggest campaigns
    top = sorted(by_ref.items(), key=lambda kv: kv[1], reverse=True)[:8]
    campaigns = []
    for (service, ref), paisa in top:
        if paisa <= 0:
            continue
        try:
            cid = uuid.UUID(ref)
        except ValueError:
            continue
        name = await db.scalar(select(SmsCampaign.name).where(SmsCampaign.id == cid)) if service in ("sms", "whatsapp") else await db.scalar(select(Campaign.name).where(Campaign.id == cid))
        campaigns.append({"name": name or "Deleted campaign", "service": SERVICE_LABELS.get(service, service), "spent_bdt": _bdt(paisa)})

    net_spent = spent_gross - refunds
    return {
        "days": days,
        "balance_bdt": _bdt(await get_balance(db, org_id)),
        "totals": {"added_bdt": _bdt(topups + max(manual, 0)), "spent_bdt": _bdt(net_spent), "refunded_bdt": _bdt(refunds), "transactions": len(rows)},
        "by_service": sorted(
            [{"service": k, "label": SERVICE_LABELS.get(k, k.replace("_", " ").title()), "spent_bdt": _bdt(v["paisa"]), "units": v["units"]} for k, v in by_service.items() if v["paisa"] or v["units"]],
            key=lambda x: x["spent_bdt"], reverse=True),
        "by_day": series,
        "top_campaigns": campaigns,
    }


async def sms_platform_usage(db: AsyncSession, days: int = 30) -> dict:
    """Admin view: SMS volume and what customers paid for it, per day and per company."""
    days = max(1, min(days, 365))
    since = _since(days)
    ev = await db.execute(
        select(SmsEvent.organization_id, SmsEvent.type, func.date(SmsEvent.occurred_at), func.count(SmsEvent.id))
        .join(SmsCampaign, SmsCampaign.id == SmsEvent.sms_campaign_id)
        .where(SmsEvent.occurred_at >= since, SmsCampaign.channel == SmsChannel.SMS)
        .group_by(SmsEvent.organization_id, SmsEvent.type, func.date(SmsEvent.occurred_at))
    )
    per_day: dict[str, dict] = defaultdict(lambda: {"sent": 0, "failed": 0})
    per_org: dict[uuid.UUID, dict] = defaultdict(lambda: {"sent": 0, "failed": 0, "spend": 0})
    for org_id, typ, day, n in ev.all():
        key = "sent" if typ == SmsEventType.SENT else "failed"
        per_day[str(day)][key] += n
        per_org[org_id][key] += n

    tx = await db.execute(
        select(WalletTransaction.organization_id, WalletTransaction.type, func.sum(WalletTransaction.amount_paisa))
        .where(WalletTransaction.service == "sms", WalletTransaction.created_at >= since, WalletTransaction.type.in_(("deduction", "refund")))
        .group_by(WalletTransaction.organization_id, WalletTransaction.type)
    )
    revenue = 0
    for org_id, typ, total in tx.all():
        per_org[org_id]["spend"] += -int(total)
        revenue += -int(total)

    names = {o.id: o for o in await db.scalars(select(Organization).where(Organization.id.in_(list(per_org) or [uuid.uuid4()])))}
    start = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date()
    series = [{"date": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
               "sent": per_day[(start + timedelta(days=i)).strftime("%Y-%m-%d")]["sent"],
               "failed": per_day[(start + timedelta(days=i)).strftime("%Y-%m-%d")]["failed"]} for i in range(days)]
    sent = sum(v["sent"] for v in per_org.values())
    failed = sum(v["failed"] for v in per_org.values())
    return {
        "days": days,
        "totals": {"sent": sent, "failed": failed, "customer_spend_bdt": _bdt(revenue), "success_rate": round(sent / (sent + failed) * 100, 1) if sent + failed else None},
        "by_day": series,
        "by_tenant": sorted(
            [{"org_id": str(o), "name": names[o].name if o in names else "Deleted company", "sent": v["sent"], "failed": v["failed"], "spend_bdt": _bdt(v["spend"])} for o, v in per_org.items()],
            key=lambda x: x["sent"], reverse=True),
    }
