"""Push notification service. Web Push with VAPID keys that the platform admin sets up once (Integrations → Firebase / VAPID);
every customer's subscribers are kept separately. Customers who created their own keys before keep using them."""
from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.push import PushCampaign, PushConfig, PushToken
from app.models.segment import Segment
from app.schemas.push import PushCampaignCreate, PushTokenRegister


# ---------------------------------------------------------------------------
# VAPID key generation
# ---------------------------------------------------------------------------

def generate_vapid_keys() -> tuple[str, str]:
    """Return (public_key_base64url, private_key_pem)."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption
    )
    import base64

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    pub_bytes = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    pub_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()

    priv_pem = private_key.private_bytes(
        Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
    ).decode()

    return pub_b64, priv_pem


# ---------------------------------------------------------------------------
# Config CRUD
# ---------------------------------------------------------------------------

async def get_or_create_config(db: AsyncSession, org_id: uuid.UUID) -> PushConfig:
    result = await db.execute(
        select(PushConfig).where(PushConfig.organization_id == org_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        now = datetime.now(timezone.utc)
        config = PushConfig(organization_id=org_id, created_at=now, updated_at=now)
        db.add(config)
    if not config.site_key:
        config.site_key = secrets.token_urlsafe(14)
    await db.commit()
    await db.refresh(config)
    return config


async def vapid_keys(db: AsyncSession, org_id: uuid.UUID, config: PushConfig) -> dict | None:
    """Which VAPID keys sign this customer's pushes: the platform's, unless they already have
    subscribers made with keys of their own (those subscriptions only work with the same keys)."""
    from app.core.service_creds import get_live_creds  # noqa: PLC0415

    own = ({"public": config.vapid_public_key, "private": config.vapid_private_key, "subject": config.vapid_subject}
           if config.vapid_private_key and config.vapid_public_key else None)
    if own and (await db.scalar(select(func.count(PushToken.id)).where(PushToken.organization_id == org_id)) or 0) > 0:
        return own
    platform = await get_live_creds(db, "firebase_vapid")
    if platform and platform.get("vapid_public_key") and platform.get("vapid_private_key"):
        return {"public": platform["vapid_public_key"], "private": platform["vapid_private_key"],
                "subject": platform.get("vapid_subject") or "mailto:admin@leadbangla.com"}
    return own


# ---------------------------------------------------------------------------
# Token registration
# ---------------------------------------------------------------------------

async def register_token(
    db: AsyncSession,
    org_id: uuid.UUID,
    data: PushTokenRegister,
    user_email: str | None = None,
    source: str = "dashboard",
) -> PushToken:
    # Find matching contact by email or explicit contact_id
    contact_id = data.contact_id
    if not contact_id and user_email:
        result = await db.execute(
            select(Contact).where(
                Contact.organization_id == org_id,
                func.lower(Contact.email) == user_email.lower(),
                Contact.deleted_at.is_(None),
            )
        )
        contact = result.scalar_one_or_none()
        if contact:
            contact_id = contact.id

    # Upsert: update existing token for this endpoint or create new
    result = await db.execute(
        select(PushToken).where(PushToken.endpoint == data.endpoint)
    )
    token = result.scalar_one_or_none()
    if token:
        token.p256dh = data.p256dh
        token.auth_secret = data.auth
        token.contact_id = contact_id
        token.user_agent = data.user_agent
        token.organization_id = org_id
        token.source = source
        token.email = user_email or token.email
    else:
        token = PushToken(
            organization_id=org_id,
            contact_id=contact_id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth_secret=data.auth,
            user_agent=data.user_agent,
            source=source,
            email=user_email,
        )
        db.add(token)
    await db.commit()
    await db.refresh(token)
    return token


async def list_tokens(db: AsyncSession, org_id: uuid.UUID) -> list[PushToken]:
    result = await db.execute(
        select(PushToken)
        .where(PushToken.organization_id == org_id)
        .order_by(PushToken.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_token(db: AsyncSession, org_id: uuid.UUID, endpoint: str) -> bool:
    result = await db.execute(
        select(PushToken).where(
            PushToken.organization_id == org_id,
            PushToken.endpoint == endpoint,
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        return False
    await db.delete(token)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Sending helpers
# ---------------------------------------------------------------------------

def _send_vapid(token: PushToken, title: str, body: str, click_url: str, icon_url: str,
                vapid_private_pem: str, vapid_subject: str) -> str:
    """'ok', 'gone' (the browser unsubscribed — remove it) or 'fail'."""
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info={
                "endpoint": token.endpoint,
                "keys": {"p256dh": token.p256dh, "auth": token.auth_secret},
            },
            data=json.dumps({
                "title": title,
                "body": body,
                "url": click_url or "/",
                "icon": icon_url or "",
            }),
            vapid_private_key=vapid_private_pem,
            vapid_claims={"sub": vapid_subject or "mailto:admin@leadbangla.com"},
        )
        return "ok"
    except Exception as e:  # noqa: BLE001
        status = getattr(getattr(e, "response", None), "status_code", None)
        return "gone" if status in (404, 410) else "fail"


async def _send_onesignal(
    app_id: str, api_key: str, title: str, body: str,
    click_url: str, contact_ids: list[uuid.UUID] | None,
) -> dict:
    payload: dict = {
        "app_id": app_id,
        "headings": {"en": title},
        "contents": {"en": body},
        "url": click_url or "https://example.com",
    }
    if contact_ids:
        payload["include_external_user_ids"] = [str(c) for c in contact_ids]
    else:
        payload["included_segments"] = ["Subscribed Users"]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://onesignal.com/api/v1/notifications",
            json=payload,
            headers={"Authorization": f"Basic {api_key}", "Content-Type": "application/json"},
        )
    return resp.json()


# ---------------------------------------------------------------------------
# Campaign CRUD + send
# ---------------------------------------------------------------------------

async def list_campaigns(db: AsyncSession, org_id: uuid.UUID) -> list[PushCampaign]:
    result = await db.execute(
        select(PushCampaign)
        .where(PushCampaign.organization_id == org_id)
        .order_by(PushCampaign.created_at.desc())
    )
    return list(result.scalars().all())


async def create_and_send_campaign(
    db: AsyncSession, org_id: uuid.UUID, data: PushCampaignCreate
) -> PushCampaign:
    config = await get_or_create_config(db, org_id)

    campaign = PushCampaign(
        organization_id=org_id,
        title=data.title,
        body=data.body,
        icon_url=data.icon_url,
        click_url=data.click_url,
        segment_id=data.segment_id,
        provider="vapid",
        status="sending",
        sent_at=datetime.now(timezone.utc),
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)

    try:
        keys = await vapid_keys(db, org_id, config)
        if not keys:
            raise ValueError("Push isn't switched on yet. Ask the platform admin to set up the push keys.")
        tokens = await _get_target_tokens(db, org_id, data.segment_id)
        sent, failed, gone = 0, 0, []
        for token in tokens:
            res = _send_vapid(token, data.title, data.body, data.click_url or "", data.icon_url or "", keys["private"], keys["subject"])
            if res == "ok":
                sent += 1
            else:
                failed += 1
                if res == "gone":
                    gone.append(token)
        for t in gone:        # people who turned notifications off are dropped from the list
            await db.delete(t)
        campaign.sent_count = sent
        campaign.failed_count = failed
        if not tokens:
            campaign.error_message = "Nobody is subscribed yet" if not data.segment_id else "Nobody in that segment is subscribed yet"
        campaign.status = "sent"
    except Exception as exc:
        campaign.status = "failed"
        campaign.error_message = str(exc)[:500]

    await db.commit()
    await db.refresh(campaign)
    return campaign


async def _segment_contact_ids(
    db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID
) -> list[uuid.UUID]:
    seg_result = await db.execute(
        select(Segment).where(Segment.id == segment_id, Segment.organization_id == org_id)
    )
    seg = seg_result.scalar_one_or_none()
    if not seg:
        return []
    from app.services.audience_service import build_segment_query
    from app.schemas.audience import SegmentRule
    rules = [SegmentRule(**r) for r in seg.rules]
    q = build_segment_query(org_id, rules, seg.match_type)
    contacts = (await db.execute(q)).scalars().all()
    return [c.id for c in contacts]


async def _get_target_tokens(
    db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID | None
) -> list[PushToken]:
    q = select(PushToken).where(PushToken.organization_id == org_id)
    if segment_id:
        contact_ids = await _segment_contact_ids(db, org_id, segment_id)
        if not contact_ids:
            return []
        q = q.where(PushToken.contact_id.in_(contact_ids))
    result = await db.execute(q)
    return list(result.scalars().all())
