import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.enums import CampaignStatus, EventType, SmsCampaignStatus, SmsEventType, SocialPostStatus
from app.models.event import Event
from app.models.paid_ads import AdCampaign, AdSpendRecord, PaidAdsAccount
from app.models.sms import SmsCampaign, SmsEvent
from app.models.social import SocialPost
from app.services.campaign_service import event_counts_for_campaign, list_campaigns


async def get_org_analytics(db: AsyncSession, org_id: uuid.UUID) -> dict:
    total_contacts = await db.scalar(
        select(func.count()).select_from(Contact).where(Contact.organization_id == org_id)
    ) or 0

    total_campaigns = await db.scalar(
        select(func.count()).select_from(Campaign).where(Campaign.organization_id == org_id)
    ) or 0

    sent_campaigns = await db.scalar(
        select(func.count())
        .select_from(Campaign)
        .where(Campaign.organization_id == org_id, Campaign.status == CampaignStatus.SENT)
    ) or 0

    event_rows = await db.execute(
        select(Event.type, func.count())
        .where(Event.organization_id == org_id)
        .group_by(Event.type)
    )
    event_totals: dict[str, int] = {row[0].value: row[1] for row in event_rows.all()}
    total_sent = event_totals.get(EventType.SENT.value, 0)
    total_opened = event_totals.get(EventType.OPENED.value, 0)
    total_clicked = event_totals.get(EventType.CLICKED.value, 0)

    campaigns = await list_campaigns(db, org_id)
    campaign_stats = []
    for c in campaigns:
        counts = await event_counts_for_campaign(db, c.id)
        s, o, cl = counts["sent"], counts["opened"], counts["clicked"]
        campaign_stats.append(
            {
                "id": c.id,
                "name": c.name,
                "status": c.status.value,
                "sent_count": s,
                "opened_count": o,
                "clicked_count": cl,
                "open_rate": round(o / s * 100, 1) if s > 0 else 0.0,
                "click_rate": round(cl / s * 100, 1) if s > 0 else 0.0,
            }
        )

    return {
        "total_contacts": total_contacts,
        "total_campaigns": total_campaigns,
        "sent_campaigns": sent_campaigns,
        "total_sent": total_sent,
        "total_opened": total_opened,
        "total_clicked": total_clicked,
        "open_rate": round(total_opened / total_sent * 100, 1) if total_sent > 0 else 0.0,
        "click_rate": round(total_clicked / total_sent * 100, 1) if total_sent > 0 else 0.0,
        "campaigns": campaign_stats,
    }


# ---------------------------------------------------------------------------
# Cross-channel analytics (Step 14)
# ---------------------------------------------------------------------------

def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


async def get_cross_channel_analytics(
    db: AsyncSession,
    org_id: uuid.UUID,
    from_date: date | None = None,
    to_date: date | None = None,
) -> dict:
    today = date.today()
    from_date = from_date or (today - timedelta(days=30))
    to_date = to_date or today
    dt_from = _dt(from_date)
    dt_to = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=timezone.utc)

    # ------------------------------------------------------------------
    # Email channel
    # ------------------------------------------------------------------
    email_campaigns = (await db.scalars(
        select(Campaign)
        .where(
            Campaign.organization_id == org_id,
            Campaign.status == CampaignStatus.SENT,
            Campaign.sent_at >= dt_from,
            Campaign.sent_at <= dt_to,
        )
        .order_by(Campaign.sent_at.desc())
    )).all()

    email_activity = []
    email_total_sent = email_total_opened = email_total_clicked = 0

    for c in email_campaigns:
        counts = await event_counts_for_campaign(db, c.id)
        s, o, cl = counts["sent"], counts["opened"], counts["clicked"]
        email_total_sent += s
        email_total_opened += o
        email_total_clicked += cl
        open_rate = min(round(o / s * 100, 1), 100.0) if s > 0 else 0.0
        click_rate = min(round(cl / s * 100, 1), 100.0) if s > 0 else 0.0
        email_activity.append({
            "id": str(c.id),
            "name": c.name,
            "channel": "email",
            "platform": None,
            "date": (c.sent_at or c.created_at).isoformat(),
            "metric_a_label": "Open rate",
            "metric_a": open_rate,
            "metric_b_label": "Click rate",
            "metric_b": click_rate,
            "total_reached": s,
        })

    email_summary = {
        "campaigns_run": len(email_campaigns),
        "total_sent": email_total_sent,
        "total_opened": email_total_opened,
        "total_clicked": email_total_clicked,
        "open_rate": min(round(email_total_opened / email_total_sent * 100, 1), 100.0) if email_total_sent > 0 else 0.0,
        "click_rate": min(round(email_total_clicked / email_total_sent * 100, 1), 100.0) if email_total_sent > 0 else 0.0,
    }

    # ------------------------------------------------------------------
    # SMS channel
    # ------------------------------------------------------------------
    sms_campaigns = (await db.scalars(
        select(SmsCampaign)
        .where(
            SmsCampaign.organization_id == org_id,
            SmsCampaign.status == SmsCampaignStatus.SENT,
            SmsCampaign.sent_at >= dt_from,
            SmsCampaign.sent_at <= dt_to,
        )
        .order_by(SmsCampaign.sent_at.desc())
    )).all()

    sms_activity = []
    sms_total_sent = sms_total_delivered = sms_total_failed = 0

    for c in sms_campaigns:
        event_rows = await db.execute(
            select(SmsEvent.type, func.count())
            .where(SmsEvent.sms_campaign_id == c.id, SmsEvent.opted_out_skip.is_(False))
            .group_by(SmsEvent.type)
        )
        sms_counts: dict[str, int] = {r[0].value: r[1] for r in event_rows.all()}
        s = sms_counts.get(SmsEventType.SENT.value, 0)
        d = sms_counts.get(SmsEventType.DELIVERED.value, 0)
        f = sms_counts.get(SmsEventType.FAILED.value, 0)
        sms_total_sent += s
        sms_total_delivered += d
        sms_total_failed += f
        delivery_rate = round(d / s * 100, 1) if s > 0 else 0.0
        sms_activity.append({
            "id": str(c.id),
            "name": c.name,
            "channel": "sms",
            "platform": None,
            "date": (c.sent_at or c.created_at).isoformat(),
            "metric_a_label": "Delivery rate",
            "metric_a": delivery_rate,
            "metric_b_label": "Failed",
            "metric_b": f,
            "total_reached": s,
        })

    sms_summary = {
        "campaigns_run": len(sms_campaigns),
        "total_sent": sms_total_sent,
        "total_delivered": sms_total_delivered,
        "total_failed": sms_total_failed,
        "delivery_rate": round(sms_total_delivered / sms_total_sent * 100, 1) if sms_total_sent > 0 else 0.0,
    }

    # ------------------------------------------------------------------
    # Social channel
    # ------------------------------------------------------------------
    social_posts = (await db.scalars(
        select(SocialPost)
        .where(
            SocialPost.organization_id == org_id,
            SocialPost.published_at >= dt_from,
            SocialPost.published_at <= dt_to,
        )
        .order_by(SocialPost.published_at.desc())
    )).all()

    scheduled_count = await db.scalar(
        select(func.count()).select_from(SocialPost).where(
            SocialPost.organization_id == org_id,
            SocialPost.status == SocialPostStatus.SCHEDULED,
            SocialPost.scheduled_at >= dt_from,
            SocialPost.scheduled_at <= dt_to,
        )
    ) or 0

    by_platform: dict[str, int] = {}
    total_likes = total_shares = total_comments = 0
    social_activity = []

    for p in social_posts:
        plat = p.platform.value
        by_platform[plat] = by_platform.get(plat, 0) + 1
        total_likes += p.likes_count
        total_shares += p.shares_count
        total_comments += p.comments_count
        preview = p.content[:60] + ("…" if len(p.content) > 60 else "")
        social_activity.append({
            "id": str(p.id),
            "name": preview,
            "channel": "social",
            "platform": plat,
            "date": (p.published_at or p.created_at).isoformat(),
            "metric_a_label": "Likes",
            "metric_a": p.likes_count,
            "metric_b_label": "Shares",
            "metric_b": p.shares_count,
            "total_reached": p.likes_count + p.shares_count + p.comments_count,
        })

    social_summary = {
        "posts_published": len(social_posts),
        "posts_scheduled": scheduled_count,
        "total_likes": total_likes,
        "total_shares": total_shares,
        "total_comments": total_comments,
        "by_platform": by_platform,
    }

    # ------------------------------------------------------------------
    # Paid Ads channel
    # ------------------------------------------------------------------
    accounts_count = await db.scalar(
        select(func.count()).select_from(PaidAdsAccount).where(
            PaidAdsAccount.organization_id == org_id,
            PaidAdsAccount.is_connected.is_(True),
        )
    ) or 0

    spend_rows = await db.execute(
        select(
            func.sum(AdSpendRecord.spend),
            func.sum(AdSpendRecord.impressions),
            func.sum(AdSpendRecord.clicks),
            func.sum(AdSpendRecord.conversions),
        ).where(
            AdSpendRecord.organization_id == org_id,
            AdSpendRecord.date >= from_date,
            AdSpendRecord.date <= to_date,
        )
    )
    tot_spend, tot_impr, tot_clicks, tot_conv = spend_rows.one()
    tot_spend = float(tot_spend or 0)
    tot_impr = int(tot_impr or 0)
    tot_clicks = int(tot_clicks or 0)
    tot_conv = float(tot_conv or 0)
    avg_ctr = round(tot_clicks / tot_impr * 100, 2) if tot_impr > 0 else 0.0

    active_campaigns = await db.scalar(
        select(func.count()).select_from(AdCampaign).where(
            AdCampaign.organization_id == org_id,
            AdCampaign.status == "active",
        )
    ) or 0

    paid_ads_summary = {
        "accounts_connected": accounts_count,
        "campaigns_active": active_campaigns,
        "total_spend": tot_spend,
        "total_impressions": tot_impr,
        "total_clicks": tot_clicks,
        "total_conversions": tot_conv,
        "avg_ctr": avg_ctr,
    }

    # Paid ads campaigns with spend data become activity entries
    paid_campaigns = await db.scalars(
        select(AdCampaign).where(
            AdCampaign.organization_id == org_id,
            AdCampaign.synced_at.is_not(None),
        ).order_by(AdCampaign.synced_at.desc()).limit(50)
    )
    paid_activity = []
    for camp in paid_campaigns:
        row_data = await db.execute(
            select(
                func.sum(AdSpendRecord.spend),
                func.sum(AdSpendRecord.clicks),
            ).where(
                AdSpendRecord.campaign_id == camp.id,
                AdSpendRecord.date >= from_date,
                AdSpendRecord.date <= to_date,
            )
        )
        camp_spend, camp_clicks = row_data.one()
        camp_spend = float(camp_spend or 0)
        camp_clicks = int(camp_clicks or 0)
        if camp_spend == 0 and camp_clicks == 0:
            continue
        paid_activity.append({
            "id": str(camp.id),
            "name": camp.name,
            "channel": "paid_ads",
            "platform": camp.platform,
            "date": (camp.synced_at or camp.created_at).isoformat(),
            "metric_a_label": "Spend",
            "metric_a": camp_spend,
            "metric_b_label": "Clicks",
            "metric_b": camp_clicks,
            "total_reached": int(camp_clicks),
        })

    # ------------------------------------------------------------------
    # Unified activity list — merge all channels, sort by date desc
    # ------------------------------------------------------------------
    activity = sorted(
        email_activity + sms_activity + social_activity + paid_activity,
        key=lambda x: x["date"],
        reverse=True,
    )

    return {
        "date_from": from_date.isoformat(),
        "date_to": to_date.isoformat(),
        "email": email_summary,
        "sms": sms_summary,
        "social": social_summary,
        "paid_ads": paid_ads_summary,
        "activity": activity,
    }
