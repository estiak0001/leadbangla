"""Scheduled checks of the Meta WhatsApp connections (the platform's and customers' own accounts),
with an alert when one breaks or its quality drops. A problem is announced once, not on every check."""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.integrations import meta_whatsapp as mw
from app.integrations.email_client import email_client
from app.models.organization import Organization
from app.models.platform_service import PlatformService
from app.models.whatsapp_health import WhatsAppHealth
from app.services import notification_service as notif

log = logging.getLogger(__name__)
BAD_QUALITY = {"RED"}
WARN_QUALITY = {"YELLOW"}


async def _row(db: AsyncSession, org_id: uuid.UUID | None) -> WhatsAppHealth:
    q = select(WhatsAppHealth).where(WhatsAppHealth.organization_id.is_(None) if org_id is None else WhatsAppHealth.organization_id == org_id)
    row = await db.scalar(q)
    if row is None:
        row = WhatsAppHealth(organization_id=org_id, ok=True)
        db.add(row)
        await db.flush()
    return row


async def _probe(creds: dict) -> tuple[bool, str | None, str, dict]:
    """(ok, quality, message, phone_info)"""
    try:
        info = await mw.phone_info(creds)
    except mw.MetaWhatsAppError as e:
        return False, None, str(e), {}
    except Exception as e:  # noqa: BLE001 — network trouble must not crash the scheduler
        return False, None, f"Could not reach Meta: {e}", {}
    quality = (info.get("quality_rating") or "").upper() or None
    name = info.get("verified_name") or "Unnamed"
    if quality in BAD_QUALITY:
        return False, quality, f"{name}: quality rating is RED — Meta may limit or block sending. Reduce volume and review recent templates.", info
    if quality in WARN_QUALITY:
        return True, quality, f"{name}: quality rating is YELLOW — keep an eye on complaints and opt-outs.", info
    return True, quality, f"{name}: working, quality {(quality or 'unknown').lower()}.", info


async def _alert(db: AsyncSession, row: WhatsAppHealth, *, who: str, org: Organization | None, ok: bool, quality: str | None, message: str) -> None:
    key = "ok" if (ok and quality not in WARN_QUALITY) else f"{'bad' if not ok else 'warn'}:{quality or ''}:{message[:60]}"
    if key == row.alert_key:
        return
    first_check = row.alert_key is None
    previous_bad = row.alert_key not in (None, "ok")
    row.alert_key, row.alerted_at = key, datetime.now(timezone.utc)
    if key == "ok" and (first_check or not previous_bad):
        return                                   # healthy and nothing was wrong before: no news
    subject = f"[LeadBangla] WhatsApp {'problem' if key != 'ok' else 'recovered'}: {who}"
    body = f"<p><strong>{who}</strong></p><p>{message}</p><p>Checked {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC.</p>"
    sent_to: list[str] = []
    targets: list[str] = []
    if settings.platform_alert_email:
        targets.append(settings.platform_alert_email)
    if org is not None:
        owner = await notif._get_owner_user(db, org.id)  # noqa: SLF001
        if owner:
            targets.append(owner.email)
    for to in dict.fromkeys(targets):
        try:
            await email_client.send_system_email(db, to_email=to, subject=subject, html_body=body)
            sent_to.append(to)
        except Exception as e:  # noqa: BLE001
            log.warning("WhatsApp health alert to %s not sent: %s", to, e)
    log.warning("WhatsApp health [%s] %s -> alerted %s", who, message, sent_to or "nobody (log only)")


async def check_platform(db: AsyncSession) -> dict | None:
    svc = await db.scalar(select(PlatformService).where(PlatformService.code == "meta_whatsapp"))
    if svc is None or not svc.credentials_enc or not svc.is_live:
        return None                              # nothing connected, nothing to watch
    ok, quality, message, _ = await _probe(decrypt_creds(svc.credentials_enc))
    row = await _row(db, None)
    row.ok, row.quality, row.message, row.checked_at = ok, quality, message, datetime.now(timezone.utc)
    svc.last_tested_at, svc.last_test_ok, svc.last_test_error = row.checked_at, ok, None if ok else message
    await _alert(db, row, who="Platform WhatsApp connection", org=None, ok=ok, quality=quality, message=message)
    await db.commit()
    return {"ok": ok, "quality": quality, "message": message}


async def check_org(db: AsyncSession, org: Organization) -> dict | None:
    if not org.whatsapp_meta_enc:
        return None
    creds = decrypt_creds(org.whatsapp_meta_enc)
    ok, quality, message, info = await _probe(creds)
    if info:
        creds["verified_name"], creds["quality"] = info.get("verified_name"), info.get("quality_rating")
        org.whatsapp_meta_enc = encrypt_creds(creds)
    row = await _row(db, org.id)
    row.ok, row.quality, row.message, row.checked_at = ok, quality, message, datetime.now(timezone.utc)
    await _alert(db, row, who=f"{org.name} (own WhatsApp account)", org=org, ok=ok, quality=quality, message=message)
    await db.commit()
    return {"ok": ok, "quality": quality, "message": message}


async def run_all(db: AsyncSession) -> dict:
    out = {"platform": await check_platform(db), "orgs_checked": 0, "orgs_with_problems": 0}
    for org in (await db.scalars(select(Organization).where(Organization.whatsapp_meta_enc.isnot(None)))).all():
        res = await check_org(db, org)
        if res:
            out["orgs_checked"] += 1
            out["orgs_with_problems"] += not res["ok"]
    return out


async def health_map(db: AsyncSession) -> dict[str | None, dict]:
    rows = (await db.scalars(select(WhatsAppHealth))).all()
    return {(str(r.organization_id) if r.organization_id else None): {"ok": r.ok, "quality": r.quality, "message": r.message, "checked_at": r.checked_at} for r in rows}
