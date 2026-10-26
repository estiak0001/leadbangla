import asyncio
import base64
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.integrations.email_delivery import EmailSendError, customer_safe, friendly_ses_error, ses_client
from app.services.email_provider_service import EmailNotConfiguredError, get_provider, get_ses_config
from app.integrations.email_client import email_client
from app.models.campaign import Campaign
from app.models.email_domain import SenderAddress, SendingDomain
from app.services.plan_service import require_plan_feature

DOMAIN_RE = re.compile(r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})$")


class EmailDomainError(Exception):
    """User-facing problem (bad input, not verified, provider failure)."""


class NotFoundError(Exception):
    pass


async def _ses_cfg(db: AsyncSession) -> dict:
    cfg = await get_ses_config(db)
    if cfg is None:
        raise EmailDomainError("Email delivery isn't set up on this platform yet. Please contact support.")
    return cfg


async def _register_in_ses(db: AsyncSession, domain: str) -> list[dict]:
    cfg = await _ses_cfg(db)

    def _create() -> list[str]:
        client = ses_client(cfg)
        try:
            resp = client.create_email_identity(EmailIdentity=domain)
        except client.exceptions.AlreadyExistsException:
            resp = client.get_email_identity(EmailIdentity=domain)
        return resp.get("DkimAttributes", {}).get("Tokens", [])

    try:
        tokens = await asyncio.to_thread(_create)
    except Exception as e:
        raise EmailDomainError(customer_safe(friendly_ses_error(e, region=cfg["region"]), log_prefix="domain setup"))
    records = [
        {"type": "CNAME", "host": f"{t}._domainkey.{domain}", "data": f"{t}.dkim.amazonses.com", "purpose": "dkim", "required": True, "verified": False}
        for t in tokens
    ]
    return records + [_spf_record(domain, "amazonses.com"), _dmarc_record(domain)]


def _generate_dkim() -> tuple[str, str]:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode()
    pub_der = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return pem, base64.b64encode(pub_der).decode()


def _spf_record(domain: str, include: str) -> dict:
    return {"type": "TXT", "host": domain, "data": f"v=spf1 include:{include} ~all", "purpose": "spf", "required": True, "verified": False}


def _dmarc_record(domain: str) -> dict:
    return {"type": "TXT", "host": f"_dmarc.{domain}", "data": f"v=DMARC1; p=none; rua=mailto:dmarc@{domain}", "purpose": "dmarc", "required": False, "verified": False}


async def _list(db: AsyncSession, model, org_id, *where):
    return list(await db.scalars(select(model).where(model.organization_id == org_id, *where)))


async def list_domains(db: AsyncSession, org_id: uuid.UUID) -> list[SendingDomain]:
    return list(await db.scalars(
        select(SendingDomain)
        .where(SendingDomain.organization_id == org_id, SendingDomain.deleted_at.is_(None))
        .order_by(SendingDomain.created_at)
    ))


async def list_trashed_domains(db: AsyncSession, org_id: uuid.UUID) -> list[SendingDomain]:
    return list(await db.scalars(
        select(SendingDomain)
        .where(SendingDomain.organization_id == org_id, SendingDomain.deleted_at.isnot(None))
        .order_by(SendingDomain.deleted_at.desc())
    ))


async def get_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID, *, include_deleted: bool = False) -> SendingDomain:
    q = select(SendingDomain).where(SendingDomain.organization_id == org_id, SendingDomain.id == domain_id)
    if not include_deleted:
        q = q.where(SendingDomain.deleted_at.is_(None))
    d = await db.scalar(q)
    if d is None:
        raise NotFoundError(domain_id)
    return d


def _normalize_domain(raw: str) -> str:
    domain = raw.strip().lower().removeprefix("http://").removeprefix("https://").strip("/")
    if not DOMAIN_RE.match(domain):
        raise EmailDomainError("Enter a valid domain like example.com")
    return domain


async def _ensure_domain_free(db: AsyncSession, org_id: uuid.UUID, domain: str, *, ignore_id: uuid.UUID | None = None) -> None:
    existing = await db.scalar(select(SendingDomain).where(SendingDomain.domain == domain))
    if existing is None or existing.id == ignore_id:
        return
    if existing.organization_id == org_id and existing.deleted_at is not None:
        raise EmailDomainError(f"{domain} is in your trash. Restore it from the Trash section instead of adding it again.")
    raise EmailDomainError("This domain is already registered")


async def _build_records(db: AsyncSession, domain: str) -> tuple[str, list[dict], str | None, str | None]:
    """(provider, records, dkim_selector, dkim_private_key_enc) for a fresh domain."""
    if await get_ses_config(db):
        return "ses", await _register_in_ses(db, domain), None, None
    pem, pub = _generate_dkim()
    selector = settings.email_dkim_selector
    records = [
        {"type": "TXT", "host": f"{selector}._domainkey.{domain}", "data": f"v=DKIM1; k=rsa; p={pub}", "purpose": "dkim", "required": True, "verified": False},
        _spf_record(domain, settings.email_spf_include),
        _dmarc_record(domain),
    ]
    return "smtp", records, selector, encrypt_creds({"pem": pem})


async def _drop_ses_identity(db: AsyncSession, d: SendingDomain) -> None:
    if d.provider != "ses":
        return
    cfg = await get_ses_config(db)
    if cfg:
        try:
            await asyncio.to_thread(lambda: ses_client(cfg).delete_email_identity(EmailIdentity=d.domain))
        except Exception:
            pass  # best effort — removing our record is what matters


async def update_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID, raw_domain: str) -> SendingDomain:
    """Rename a domain (e.g. fix a typo). Authentication restarts: new DNS records, status back to pending.
    Sender addresses on it follow the new domain (same name before the @)."""
    d = await get_domain(db, org_id, domain_id)
    new = _normalize_domain(raw_domain)
    if new == d.domain:
        return d
    await _ensure_domain_free(db, org_id, new, ignore_id=d.id)

    provider, records, selector, key_enc = await _build_records(db, new)
    old = d.domain
    await _drop_ses_identity(db, d)
    d.domain, d.provider, d.dns_records = new, provider, records
    d.dkim_selector, d.dkim_private_key_enc = selector, key_enc
    d.status, d.verified_at, d.paused_reason = "pending", None, None
    d.dns_submitted_at = d.last_checked_at = None
    d.status_note = f"Domain changed from {old} to {new}. Add the new DNS records, then click Verify DNS."
    for sender in await db.scalars(select(SenderAddress).where(SenderAddress.domain_id == d.id)):
        sender.email = f"{sender.email.split('@')[0]}@{new}"
    await db.commit()
    await db.refresh(d)
    return d


async def add_domain(db: AsyncSession, org_id: uuid.UUID, raw_domain: str) -> SendingDomain:
    await require_plan_feature(db, org_id, "custom_domain", "custom_domain")
    domain = _normalize_domain(raw_domain)
    await _ensure_domain_free(db, org_id, domain)

    provider, records, selector, pem_enc = await _build_records(db, domain)

    d = SendingDomain(
        organization_id=org_id, domain=domain, provider=provider, status="pending",
        dkim_selector=selector, dkim_private_key_enc=pem_enc, dns_records=records,
    )
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


def _resolve(name: str, rtype: str):
    """Ask public resolvers directly — the server's own resolver caches old records for a long time,
    which makes a freshly fixed record look wrong. Falls back to the system resolver if they are unreachable."""
    import dns.resolver

    public = dns.resolver.Resolver()
    public.nameservers = ["8.8.8.8", "1.1.1.1"]
    try:
        return public.resolve(name, rtype, lifetime=6)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        raise
    except Exception:
        return dns.resolver.resolve(name, rtype, lifetime=6)


def _txt_values(name: str) -> list[str]:
    try:
        answers = _resolve(name, "TXT")
    except Exception:
        return []
    return ["".join(part.decode() for part in rdata.strings) for rdata in answers]


def _cname_value(name: str) -> str | None:
    try:
        answers = _resolve(name, "CNAME")
    except Exception:
        return None
    return str(next(iter(answers)).target).rstrip(".").lower()


def _domain_dns_state(domain: str) -> str:
    """"nxdomain" if the domain isn't in public DNS at all (unregistered, typo, or nameservers not set), else "ok"."""
    import dns.resolver

    r = dns.resolver.Resolver()
    r.nameservers = ["8.8.8.8", "1.1.1.1"]
    for rtype in ("NS", "SOA", "A"):
        try:
            r.resolve(domain, rtype, lifetime=6)
            return "ok"
        except dns.resolver.NXDOMAIN:
            continue
        except Exception:
            return "ok"  # can't tell (timeout / no answer for this type) — don't claim it's missing
    return "nxdomain"


def _check_record_sync(rec: dict) -> bool:
    if rec["type"] == "CNAME":
        return _cname_value(rec["host"]) == rec["data"].rstrip(".").lower()
    values = _txt_values(rec["host"])
    if rec["purpose"] == "dkim":
        want = re.sub(r"\s", "", rec["data"].split("p=")[-1])
        return any(want and want in re.sub(r"\s", "", v) for v in values)
    if rec["purpose"] == "spf":
        include = rec["data"].split("include:")[-1].split()[0]
        return any(v.lower().startswith("v=spf1") and include in v for v in values)
    if rec["purpose"] == "dmarc":
        return any(v.lower().startswith("v=dmarc1") for v in values)
    return False


async def verify_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID) -> SendingDomain:
    d = await get_domain(db, org_id, domain_id)
    records = [dict(r) for r in (d.dns_records or [])]
    note: str | None = None

    if settings.email_skip_dns_verify:
        for r in records:
            r["verified"] = True
        ok = True
        note = "DNS checks are skipped (development mode) — this domain is NOT really verified."
    elif d.provider == "ses":
        cfg = await _ses_cfg(db)

        def _status() -> dict:
            return ses_client(cfg).get_email_identity(EmailIdentity=d.domain)
        try:
            ident = await asyncio.to_thread(_status)
        except Exception as e:
            raise EmailDomainError(customer_safe(friendly_ses_error(e, region=cfg["region"]), log_prefix="domain setup"))
        dkim_status = ident.get("DkimAttributes", {}).get("Status", "NOT_STARTED")
        ok = bool(ident.get("VerifiedForSendingStatus")) and dkim_status == "SUCCESS"
        for r in records:
            if r["purpose"] == "dkim":
                r["verified"] = dkim_status == "SUCCESS"
            else:
                r["verified"] = await asyncio.to_thread(_check_record_sync, r)
        if ok:
            note = "Verified. Your domain is ready to send."
        elif dkim_status == "FAILED":
            note = "We could not find the DKIM records yet. Check they were added exactly as shown (no extra domain suffix), then re-check."
        else:
            note = "We haven't detected the DKIM records yet. DNS can take up to 72 hours; usually minutes."
    else:
        for r in records:
            r["verified"] = await asyncio.to_thread(_check_record_sync, r)
        ok = all(r["verified"] for r in records if r.get("required"))
        missing = [r["purpose"].upper() for r in records if r.get("required") and not r["verified"]]
        mismatched = []
        for r in records:
            if r.get("required") and not r["verified"] and r["type"] == "TXT":
                found = await asyncio.to_thread(_txt_values, r["host"])
                if any(v.lower().startswith(("v=dkim1", "v=spf1")) for v in found):
                    mismatched.append(r["purpose"].upper())
        if ok:
            note = "All required DNS records found."
        elif mismatched:
            note = (
                f"A {', '.join(mismatched)} record exists at the right name but its value is different from the one shown here "
                "(often an older value). Replace it with the current value using the Copy button, then verify again."
            )
        else:
            note = (
                f"Not found yet: {', '.join(missing)}. Check each record's Name and Value match exactly (no quotes), "
                f"and that you added them to the DNS of {d.domain}. New records can take a few minutes to hours."
            )

    if not ok and not settings.email_skip_dns_verify and await asyncio.to_thread(_domain_dns_state, d.domain) == "nxdomain":
        note = (
            f"{d.domain} does not exist in public DNS (NXDOMAIN) — no records can be found. "
            "Check the spelling of the domain, that it is registered, and that its nameservers point to the DNS provider where you added the records."
        )
    now = datetime.now(timezone.utc)
    d.dns_records = records
    d.status_note = note
    d.last_checked_at = now
    if d.dns_submitted_at is None:
        d.dns_submitted_at = now
    if ok and d.status == "pending":
        d.status = "verified"
        d.verified_at = datetime.now(timezone.utc)
    elif not ok and d.status == "verified":
        d.status = "pending"
    await db.commit()
    await db.refresh(d)
    return d


async def auto_verify_pending(db: AsyncSession) -> dict:
    """Background re-check of domains whose owners already submitted their DNS records,
    so the status updates by itself (run every few minutes by Celery beat). Gives up after 72h."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=72)
    domains = list(await db.scalars(
        select(SendingDomain).where(
            SendingDomain.status == "pending",
            SendingDomain.deleted_at.is_(None),
            SendingDomain.dns_submitted_at.isnot(None),
            SendingDomain.dns_submitted_at >= cutoff,
        )
    ))
    checked = verified = 0
    for d in domains:
        try:
            result = await verify_domain(db, d.organization_id, d.id)
            checked += 1
            verified += result.status == "verified"
        except Exception:
            await db.rollback()
    return {"checked": checked, "verified": verified}


async def register_with_ses(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID) -> SendingDomain:
    """Moves a domain created under another provider onto Amazon SES: new DNS records, pending again."""
    d = await get_domain(db, org_id, domain_id)
    d.dns_records = await _register_in_ses(db, d.domain)
    d.provider = "ses"
    d.status = "pending"
    d.dkim_selector = None
    d.dkim_private_key_enc = None
    d.status_note = "Registered. Add the new DNS records, then click Verify DNS."
    d.dns_submitted_at = None
    d.last_checked_at = None
    await db.commit()
    await db.refresh(d)
    return d


async def delete_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID) -> None:
    """Soft delete: moves the domain to the trash. Sending from it stops; it can be restored."""
    d = await get_domain(db, org_id, domain_id)
    d.deleted_at = datetime.now(timezone.utc)
    await db.commit()


async def restore_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID) -> SendingDomain:
    d = await get_domain(db, org_id, domain_id, include_deleted=True)
    if d.deleted_at is None:
        raise NotFoundError(domain_id)
    d.deleted_at = None
    await db.commit()
    await db.refresh(d)
    return d


async def purge_domain(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID) -> None:
    """Permanent delete from the trash (also removes the Amazon SES identity)."""
    d = await get_domain(db, org_id, domain_id, include_deleted=True)
    if d.deleted_at is None:
        raise EmailDomainError("Move the domain to the trash first.")
    await _drop_ses_identity(db, d)
    await db.delete(d)
    await db.commit()


async def resume_domain(db: AsyncSession, domain_id: uuid.UUID) -> SendingDomain:
    """Internal staff only — clears an automatic abuse pause."""
    d = await db.get(SendingDomain, domain_id)
    if d is None:
        raise NotFoundError(domain_id)
    d.status = "verified"
    d.paused_reason = None
    await db.commit()
    await db.refresh(d)
    return d


# ── Sender addresses ─────────────────────────────────────────────────────────

async def list_senders(db: AsyncSession, org_id: uuid.UUID) -> list[SenderAddress]:
    return list(await db.scalars(
        select(SenderAddress)
        .join(SendingDomain, SendingDomain.id == SenderAddress.domain_id)
        .where(SenderAddress.organization_id == org_id, SendingDomain.deleted_at.is_(None))
        .order_by(SenderAddress.created_at)
    ))


async def add_sender(db: AsyncSession, org_id: uuid.UUID, domain_id: uuid.UUID, email: str, name: str | None) -> SenderAddress:
    d = await get_domain(db, org_id, domain_id)
    email = email.strip().lower()
    m = EMAIL_RE.match(email)
    if not m or m.group(1) != d.domain:
        raise EmailDomainError(f"The address must end with @{d.domain}")
    if d.status == "pending":
        raise EmailDomainError("Verify the domain's DNS records before adding sender addresses")
    if await db.scalar(select(SenderAddress).where(SenderAddress.organization_id == org_id, SenderAddress.email == email)):
        raise EmailDomainError("This sender address already exists")
    has_default = await db.scalar(select(SenderAddress).where(SenderAddress.organization_id == org_id, SenderAddress.is_default.is_(True)))
    s = SenderAddress(organization_id=org_id, domain_id=d.id, email=email, name=(name or "").strip() or None, is_default=has_default is None)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


async def _get_sender(db: AsyncSession, org_id: uuid.UUID, sender_id: uuid.UUID) -> SenderAddress:
    s = await db.scalar(select(SenderAddress).where(SenderAddress.organization_id == org_id, SenderAddress.id == sender_id))
    if s is None:
        raise NotFoundError(sender_id)
    return s


async def set_default_sender(db: AsyncSession, org_id: uuid.UUID, sender_id: uuid.UUID) -> SenderAddress:
    s = await _get_sender(db, org_id, sender_id)
    for other in await list_senders(db, org_id):
        other.is_default = other.id == s.id
    await db.commit()
    await db.refresh(s)
    return s


async def delete_sender(db: AsyncSession, org_id: uuid.UUID, sender_id: uuid.UUID) -> None:
    s = await _get_sender(db, org_id, sender_id)
    was_default = s.is_default
    await db.delete(s)
    await db.flush()
    if was_default:
        nxt = (await list_senders(db, org_id))
        if nxt:
            nxt[0].is_default = True
    await db.commit()


# ── Resolving a sender for a send ────────────────────────────────────────────

async def resolve_sender(db: AsyncSession, org_id: uuid.UUID, sender_id: uuid.UUID | None) -> dict | None:
    """Returns {"from_email","from_name","dkim","domain_status","domain"} for the
    campaign's sender (or the org default), or None to use the platform address."""
    sender = None
    if sender_id:
        sender = await db.scalar(select(SenderAddress).where(SenderAddress.organization_id == org_id, SenderAddress.id == sender_id))
    if sender is None:
        sender = await db.scalar(select(SenderAddress).where(SenderAddress.organization_id == org_id, SenderAddress.is_default.is_(True)))
    if sender is None:
        return None
    d = await db.get(SendingDomain, sender.domain_id)
    dkim = None
    if d and d.dkim_private_key_enc and d.dkim_selector and d.provider == "smtp":
        dkim = {"domain": d.domain, "selector": d.dkim_selector, "private_key_pem": decrypt_creds(d.dkim_private_key_enc)["pem"]}
    return {
        "from_email": sender.email,
        "from_name": sender.name,
        "dkim": dkim,
        "domain": d.domain if d else None,
        "domain_provider": d.provider if d else None,
        "domain_status": ("deleted" if d and d.deleted_at else d.status) if d else "pending",
        "paused_reason": d.paused_reason if d else None,
    }


async def send_test_email(db: AsyncSession, org_id: uuid.UUID, sender_id: uuid.UUID, to_email: str) -> str:
    to_email = to_email.strip()
    if not EMAIL_RE.match(to_email):
        raise EmailDomainError("Enter a valid recipient email")
    info = await resolve_sender(db, org_id, sender_id)
    if info is None:
        raise NotFoundError(sender_id)
    if info["domain_status"] == "deleted":
        raise EmailDomainError("This sender's domain is in the trash. Restore it first.")
    if info["domain_status"] != "verified":
        raise EmailDomainError("This sender's domain is not verified yet — verify its DNS records first." if info["domain_status"] == "pending" else f"Sending is paused: {info['paused_reason']}")
    provider = await get_provider(db)
    if provider.kind == "ses" and info.get("domain_provider") != "ses":
        raise EmailDomainError("This domain needs to be registered for sending first. Open the domain and click \"Register domain\".")
    try:
        return await email_client.send_email(
            db, org_id=org_id, to_email=to_email, subject="Test email from LeadBangla",
            html_body=f"<p>This is a test email sent from <strong>{info['from_email']}</strong>.</p><p>If you can read this, your domain setup works.</p>",
            from_email=info["from_email"], from_name=info["from_name"], dkim=info["dkim"],
        )
    except (EmailSendError, EmailNotConfiguredError) as e:
        raise EmailDomainError(customer_safe(str(e), log_prefix="test email"))
    except Exception as e:
        raise EmailDomainError(customer_safe(f"Sending failed: {e}", log_prefix="test email"))
