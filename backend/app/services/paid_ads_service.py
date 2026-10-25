from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paid_ads import AdCampaign, AdSpendRecord, PaidAdsAccount
from app.schemas.paid_ads import (
    AccountCreate,
    AccountRead,
    CampaignCreate,
    CampaignRead,
    SpendRecordRead,
    SyncResult,
)
from app.services import google_ads_service, meta_ads_service


# ── Accounts ──────────────────────────────────────────────────────────────────


async def list_accounts(db: AsyncSession, org_id: uuid.UUID) -> list[AccountRead]:
    rows = await db.scalars(
        select(PaidAdsAccount)
        .where(PaidAdsAccount.organization_id == org_id)
        .order_by(PaidAdsAccount.created_at)
    )
    return [AccountRead.model_validate(r) for r in rows]


async def connect_account(
    db: AsyncSession, org_id: uuid.UUID, payload: AccountCreate
) -> AccountRead:
    if payload.platform not in ("google", "meta"):
        raise ValueError("platform must be 'google' or 'meta'")

    # Validate credentials immediately
    if payload.platform == "google":
        connected = await google_ads_service.verify_credentials(payload.credentials)
    else:
        connected = await meta_ads_service.verify_credentials(payload.credentials)

    account = PaidAdsAccount(
        organization_id=org_id,
        platform=payload.platform,
        label=payload.label,
        credentials=payload.credentials,
        is_connected=connected,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return AccountRead.model_validate(account)


async def delete_account(db: AsyncSession, org_id: uuid.UUID, account_id: uuid.UUID) -> bool:
    account = await db.scalar(
        select(PaidAdsAccount).where(
            PaidAdsAccount.id == account_id,
            PaidAdsAccount.organization_id == org_id,
        )
    )
    if not account:
        return False
    await db.delete(account)
    await db.commit()
    return True


# ── Campaigns ─────────────────────────────────────────────────────────────────


async def list_campaigns(db: AsyncSession, org_id: uuid.UUID) -> list[CampaignRead]:
    campaigns = await db.scalars(
        select(AdCampaign)
        .where(AdCampaign.organization_id == org_id)
        .order_by(AdCampaign.created_at.desc())
    )
    result = []
    for c in campaigns:
        spend_rows = await db.execute(
            select(
                func.sum(AdSpendRecord.spend),
                func.sum(AdSpendRecord.impressions),
                func.sum(AdSpendRecord.clicks),
            ).where(AdSpendRecord.campaign_id == c.id)
        )
        total_spend, total_impr, total_clicks = spend_rows.one()
        r = CampaignRead.model_validate(c)
        r.total_spend = float(total_spend or 0)
        r.total_impressions = int(total_impr or 0)
        r.total_clicks = int(total_clicks or 0)
        result.append(r)
    return result


async def create_campaign(
    db: AsyncSession, org_id: uuid.UUID, payload: CampaignCreate
) -> CampaignRead:
    account = await db.scalar(
        select(PaidAdsAccount).where(
            PaidAdsAccount.id == payload.account_id,
            PaidAdsAccount.organization_id == org_id,
        )
    )
    if not account:
        raise ValueError("Account not found")

    if account.platform == "google":
        external_id = await google_ads_service.create_campaign(
            creds=account.credentials,
            name=payload.name,
            daily_budget=payload.daily_budget,
            currency_code=payload.currency,
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
    else:
        external_id = await meta_ads_service.create_campaign(
            creds=account.credentials,
            name=payload.name,
            objective=payload.objective or "OUTCOME_TRAFFIC",
            daily_budget=payload.daily_budget,
            currency=payload.currency,
            start_date=payload.start_date,
        )

    campaign = AdCampaign(
        organization_id=org_id,
        account_id=account.id,
        platform=account.platform,
        external_id=external_id,
        name=payload.name,
        objective=payload.objective,
        daily_budget=payload.daily_budget,
        currency=payload.currency,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    r = CampaignRead.model_validate(campaign)
    r.total_spend = 0.0
    r.total_impressions = 0
    r.total_clicks = 0
    return r


# ── Performance sync ──────────────────────────────────────────────────────────


async def sync_campaign(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID
) -> SyncResult:
    campaign = await db.scalar(
        select(AdCampaign).where(
            AdCampaign.id == campaign_id,
            AdCampaign.organization_id == org_id,
        )
    )
    if not campaign:
        return SyncResult(campaign_id=campaign_id, records_upserted=0, error="Campaign not found")

    account = await db.scalar(
        select(PaidAdsAccount).where(PaidAdsAccount.id == campaign.account_id)
    )
    if not account:
        return SyncResult(campaign_id=campaign_id, records_upserted=0, error="Account not found")

    try:
        if campaign.platform == "google":
            rows = await google_ads_service.sync_performance(account.credentials, campaign.external_id)
        else:
            rows = await meta_ads_service.sync_performance(account.credentials, campaign.external_id)
    except Exception as exc:
        return SyncResult(campaign_id=campaign_id, records_upserted=0, error=str(exc))

    now = datetime.now(timezone.utc)
    upserted = 0
    for row in rows:
        stmt = pg_insert(AdSpendRecord).values(
            id=uuid.uuid4(),
            campaign_id=campaign.id,
            organization_id=org_id,
            date=row["date"],
            spend=row["spend"],
            impressions=row["impressions"],
            clicks=row["clicks"],
            conversions=row["conversions"],
            synced_at=now,
        ).on_conflict_do_update(
            constraint="uq_ad_spend_record",
            set_={
                "spend": row["spend"],
                "impressions": row["impressions"],
                "clicks": row["clicks"],
                "conversions": row["conversions"],
                "synced_at": now,
            },
        )
        await db.execute(stmt)
        upserted += 1

    campaign.synced_at = now
    account.last_synced_at = now
    await db.commit()
    return SyncResult(campaign_id=campaign_id, records_upserted=upserted)


async def list_spend(
    db: AsyncSession, org_id: uuid.UUID, campaign_id: uuid.UUID
) -> list[SpendRecordRead]:
    rows = await db.scalars(
        select(AdSpendRecord)
        .where(AdSpendRecord.campaign_id == campaign_id, AdSpendRecord.organization_id == org_id)
        .order_by(AdSpendRecord.date.desc())
    )
    return [SpendRecordRead.model_validate(r) for r in rows]
