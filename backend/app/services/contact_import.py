"""CSV contact import that copes with real-world files: any header spelling,
Excel encodings and separators, Bangladeshi phone formats, plan limits,
opt-in columns, and a per-row report of anything that was not imported."""
import csv
import io
import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PlanLimitError  # noqa: F401  (documented behaviour: we report instead of raising)
from app.models.contact import Contact
from app.services.phone import normalize_bd_msisdn
from app.services.plan_service import get_plan_limit

MAX_ROWS = 20_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Every spelling we accept for each field (compared after normalising: lower-case, spaces for -/_).
ALIASES: dict[str, set[str]] = {
    "email": {"email", "e mail", "email address", "mail", "ইমেইল", "ই মেইল"},
    "phone": {"phone", "mobile", "mobile number", "phone number", "cell", "cell number", "contact number", "contact", "whatsapp", "whatsapp number", "মোবাইল", "ফোন", "মোবাইল নম্বর"},
    "first_name": {"first name", "firstname", "first", "given name", "নাম"},
    "last_name": {"last name", "lastname", "surname", "family name"},
    "full_name": {"name", "full name", "customer name", "customer", "contact name"},
    "tags": {"tags", "tag", "labels", "label", "group", "groups", "segment"},
    "company": {"company", "company name", "shop", "shop name", "business", "business name", "organization", "দোকান", "প্রতিষ্ঠান"},
    "district": {"city", "district", "town", "জেলা", "শহর"},
    "division": {"division", "বিভাগ"},
    "area": {"area", "upazila", "thana", "locality", "এলাকা", "উপজেলা", "থানা"},
    "address": {"address", "delivery address", "ঠিকানা"},
    "source": {"source", "lead source", "channel", "উৎস"},
    "customer_type": {"type", "customer type", "retail wholesale", "retail/wholesale", "category", "শ্রেণি"},
    "owner": {"owner", "assigned to", "assignee", "salesperson", "sales person", "sales rep", "account manager", "মালিক"},
    "deal_value": {"deal value", "deal", "value", "amount", "expected value", "deal amount"},
    "expected_close": {"expected close", "expected close date", "close date", "closing date"},
    "latitude": {"latitude", "lat"},
    "longitude": {"longitude", "lng", "lon", "long"},
    "map_link": {"map link", "google maps", "google map", "maps link", "location link", "map", "location"},
    "facebook_url": {"facebook", "facebook link", "facebook url", "fb", "fb link", "facebook profile"},
    "sms_opt_in": {"sms opt in", "sms optin", "sms consent", "sms"},
    "whatsapp_opt_in": {"whatsapp opt in", "whatsapp optin", "whatsapp consent"},
}
TRUE = {"yes", "y", "true", "1", "opted in", "optin", "opt in", "subscribed", "ok", "হ্যাঁ", "হ্যা"}


def _norm_header(h: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[-_]+", " ", (h or "").strip().lower().lstrip("﻿")))


def decode_csv(raw: bytes) -> str:
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")  # old Excel "CSV (comma delimited)"


def _delimiter(text: str) -> str:
    first = text.split("\n", 1)[0]
    best = max(",;\t|", key=lambda d: first.count(d))
    return best if first.count(best) else ","


def _phone(value: str) -> tuple[str | None, str | None]:
    """(canonical 01XXXXXXXXX, error). Empty value → (None, None)."""
    if not value.strip():
        return None, None
    try:
        return "0" + normalize_bd_msisdn(value)[3:], None   # 8801712345678 -> 01712345678
    except ValueError:
        return None, "not a valid Bangladeshi mobile number"


def _phone_key(value: str | None) -> str | None:
    """Same number written differently (01…, +8801…, 8801…) gets the same key."""
    if not value:
        return None
    try:
        return normalize_bd_msisdn(value)
    except ValueError:
        return re.sub(r"\D", "", value) or None


async def import_contacts_csv(db: AsyncSession, org_id: uuid.UUID, raw: bytes, changed_by_user_id: uuid.UUID | None = None, actor_role: str | None = None) -> dict:
    text = decode_csv(raw)
    if not text.strip():
        raise ValueError("The file is empty.")
    reader = csv.reader(io.StringIO(text), delimiter=_delimiter(text))
    try:
        header = next(reader)
    except StopIteration:
        raise ValueError("The file is empty.")

    # Map columns -> fields
    col: dict[str, int] = {}
    ignored: list[str] = []
    for i, h in enumerate(header):
        n = _norm_header(h)
        field = next((f for f, names in ALIASES.items() if n in names), None)
        if field and field not in col:
            col[field] = i
        elif n:
            ignored.append(h.strip())
    # Company-defined extra fields: a column named like the field's label (or key) fills it.
    from app.services.crm_sales_service import clean_custom_fields, list_custom_fields  # noqa: PLC0415

    cf_defs = await list_custom_fields(db, org_id)
    cf_cols: dict[str, int] = {}
    for i, h in enumerate(header):
        n = _norm_header(h)
        d = next((d for d in cf_defs if n in (_norm_header(d.label), _norm_header(d.key))), None)
        if d and d.key not in cf_cols and not any(i == ci for ci in col.values()):
            cf_cols[d.key] = i
            if h.strip() in ignored:
                ignored.remove(h.strip())
    if "email" not in col and "phone" not in col:
        raise ValueError("Couldn't find an email or phone column. Found: " + ", ".join(h.strip() for h in header if h.strip()) + ". Use the sample template.")

    def cell(row: list[str], field: str) -> str:
        i = col.get(field)
        return row[i].strip() if i is not None and i < len(row) else ""

    # Existing contacts, for matching (email, or the same phone in any format)
    existing = list(await db.scalars(select(Contact).where(Contact.organization_id == org_id, Contact.deleted_at.is_(None))))
    by_email = {c.email.lower(): c for c in existing if c.email}
    by_phone = {k: c for c in existing if (k := _phone_key(c.phone))}
    # People in Trash: if the file contains them again they come back instead of being duplicated.
    trashed = list(await db.scalars(select(Contact).where(Contact.organization_id == org_id, Contact.deleted_at.isnot(None)).order_by(Contact.deleted_at.desc())))
    t_email = {c.email.lower(): c for c in reversed(trashed) if c.email}
    t_phone = {k: c for c in reversed(trashed) if (k := _phone_key(c.phone))}

    limit = await get_plan_limit(db, org_id, "contacts_limit")
    room = None if limit == -1 else max(0, limit - len(existing))

    from app.services.crm_sales_service import log_consent  # noqa: PLC0415
    from app.services.crm_service import LeadAssigner  # noqa: PLC0415

    assigner = await LeadAssigner.create(db, org_id, changed_by_user_id, actor_role)
    from app.services.location_service import resolve_place  # noqa: PLC0415

    # Owner column: matched by the person's login email (or the part before the @). Sales people can't assign others.
    owners: dict[str, uuid.UUID] = {}
    if "owner" in col and actor_role != "sales":
        from app.services.crm_service import list_team  # noqa: PLC0415

        for t in await list_team(db, org_id):
            owners[t["email"].lower()] = t["user_id"]
            owners.setdefault(t["email"].split("@")[0].lower(), t["user_id"])
    elif actor_role == "sales" and "owner" in col:
        ignored.append("owner (your role can't assign leads to others)")
    created = updated = skipped = blocked = total = sms_in = wa_in = restored = 0
    errors: list[dict] = []
    new_contacts: list[Contact] = []

    def err(n: int, reason: str, value: str = "") -> None:
        if len(errors) < 100:
            errors.append({"row": n, "reason": reason, "value": value[:60]})

    for n, row in enumerate(reader, start=2):
        if not any(c.strip() for c in row):
            continue  # blank line
        total += 1
        if total > MAX_ROWS:
            raise ValueError(f"Too many rows — the limit is {MAX_ROWS:,} per file. Split the file and import in parts.")

        email = cell(row, "email").lower() or None
        if email and not EMAIL_RE.match(email):
            err(n, "invalid email address", email)
            email = None
        phone, phone_err = _phone(cell(row, "phone"))
        if phone_err:
            err(n, phone_err, cell(row, "phone"))
        if not email and not phone:
            skipped += 1
            if not phone_err and not any(e["row"] == n for e in errors):
                err(n, "no email or phone number")
            continue

        first, last = cell(row, "first_name"), cell(row, "last_name")
        full = cell(row, "full_name")
        if full and not first:
            first, _, rest = full.partition(" ")
            last = last or rest.strip()
        tags = [t.strip() for t in re.split(r"[;,|]", cell(row, "tags")) if t.strip()]
        sms = cell(row, "sms_opt_in").lower() in TRUE and bool(phone)
        wa = cell(row, "whatsapp_opt_in").lower() in TRUE and bool(phone)

        extra = {f: cell(row, f) for f in ("company", "address", "source") if cell(row, f)}
        if cell(row, "district") or cell(row, "area") or cell(row, "division"):
            place = await resolve_place(db, org_id, division=cell(row, "division"), district=cell(row, "district"), area=cell(row, "area"))
            for w in place["warnings"]:
                err(n, w + (" (kept as typed — add it in Settings → Locations)" if "not in your" in w else ""), cell(row, "district") or cell(row, "area"))
            extra.update({k: place[k] for k in ("division", "district", "area", "city") if place[k]})
        if "source" in extra:
            extra["source"] = re.sub(r"[^a-z0-9]+", "_", extra["source"].lower()).strip("_")[:60] or None

        typed: dict = {}
        ct = cell(row, "customer_type").lower()
        if ct:
            if "whole" in ct or "পাইকারি" in ct:
                typed["customer_type"] = "wholesale"
            elif "retail" in ct or "খুচরা" in ct:
                typed["customer_type"] = "retail"
            else:
                err(n, "type should be retail or wholesale", ct)
        ow = cell(row, "owner").lower()
        if ow and owners:
            if ow in owners:
                typed["owner_user_id"] = owners[ow]
            else:
                err(n, "owner is not on your team (use their login email)", ow)
        dv = re.sub(r"[^\d.]", "", cell(row, "deal_value"))
        if cell(row, "deal_value"):
            try:
                typed["deal_value"] = int(round(float(dv) * 100))
            except ValueError:
                err(n, "deal value must be a number", cell(row, "deal_value"))
        ec = cell(row, "expected_close")
        if ec:
            from datetime import datetime as _dt  # noqa: PLC0415

            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y"):
                try:
                    typed["expected_close_date"] = _dt.strptime(ec, fmt).date()
                    break
                except ValueError:
                    continue
            else:
                err(n, "close date should look like 2026-11-30 or 30/11/2026", ec)
        lat_t, lng_t = cell(row, "latitude"), cell(row, "longitude")
        if lat_t or lng_t:
            from app.services.geo import check_pair  # noqa: PLC0415

            try:
                typed["latitude"], typed["longitude"] = check_pair(lat_t, lng_t)
            except ValueError as e:
                err(n, str(e), f"{lat_t}, {lng_t}")
        elif cell(row, "map_link"):
            from app.services.geo import parse_map_text  # noqa: PLC0415

            pair = parse_map_text(cell(row, "map_link"))
            if pair:
                typed["latitude"], typed["longitude"] = pair
            else:
                err(n, "couldn't read coordinates from the map link (use a full Google Maps link or “lat, lng”)", cell(row, "map_link"))
        if cell(row, "facebook_url"):
            typed["facebook_url"] = cell(row, "facebook_url")[:300]
        cf_problems: list[str] = []
        cf_raw = {k: row[i].strip() for k, i in cf_cols.items() if i < len(row) and row[i].strip()}
        cf_values = await clean_custom_fields(db, org_id, cf_raw, strict=False, errors=cf_problems) if cf_raw else {}
        for problem in cf_problems:
            err(n, problem)

        match = (by_email.get(email) if email else None) or (by_phone.get(_phone_key(phone)) if phone else None)
        was_trashed = False
        if match is None:
            match = (t_email.get(email) if email else None) or (t_phone.get(_phone_key(phone)) if phone else None)
            if match is not None:
                if room is not None and room <= 0:
                    blocked += 1
                    continue
                match.deleted_at = None            # back from Trash
                was_trashed = True
                if room is not None:
                    room -= 1
                if match.email:
                    by_email[match.email.lower()] = match
                if match.phone and _phone_key(match.phone):
                    by_phone[_phone_key(match.phone)] = match
        if match is not None:
            match.email = email or match.email
            match.phone = phone or match.phone
            match.first_name = first or match.first_name
            match.last_name = last or match.last_name
            if tags:
                match.tags = sorted(set(match.tags) | set(tags))
            for k, v in {**extra, **typed}.items():
                if v and not getattr(match, k):
                    setattr(match, k, v)
            if cf_values:
                match.custom_fields = {**cf_values, **(match.custom_fields or {})}
            if sms and not match.sms_opt_in:
                match.sms_opt_in = True
                log_consent(db, org_id, match.id, "sms", True, "import", changed_by_user_id)
            if wa and not match.whatsapp_opt_in:
                match.whatsapp_opt_in = True
                log_consent(db, org_id, match.id, "whatsapp", True, "import", changed_by_user_id)
            if was_trashed:
                restored += 1
            else:
                updated += 1
        else:
            if room is not None and room <= 0:
                blocked += 1
                continue
            c = Contact(organization_id=org_id, email=email, phone=phone, first_name=first or None, last_name=last or None,
                        tags=tags, sms_opt_in=sms, whatsapp_opt_in=wa,
                        custom_fields=cf_values, **{k: v for k, v in {**extra, **typed}.items() if v})
            if not c.source:
                c.source = "import"
            assigner.apply(c)
            db.add(c)
            new_contacts.append(c)
            if email:
                by_email[email] = c
            if phone:
                by_phone[_phone_key(phone)] = c
            if room is not None:
                room -= 1
            created += 1
        sms_in += int(sms)
        wa_in += int(wa)

    await db.flush()
    await assigner.finish(db)
    for c in new_contacts:
        if c.sms_opt_in:
            log_consent(db, org_id, c.id, "sms", True, "import", changed_by_user_id)
        if c.whatsapp_opt_in:
            log_consent(db, org_id, c.id, "whatsapp", True, "import", changed_by_user_id)
    if new_contacts:
        from app.services.audience_service import _TRACKED_FIELDS, _contact_snapshot, _diff_snapshots, _record_history  # noqa: PLC0415

        empty = {f: None if f != "tags" else [] for f in _TRACKED_FIELDS}
        for c in new_contacts:
            changes = _diff_snapshots(empty, _contact_snapshot(c))
            if changes:
                await _record_history(db, org_id, c.id, changed_by_user_id, "created", changes)
    await db.commit()
    per_owner: dict = {}
    for c in new_contacts:
        if c.owner_user_id and c.owner_user_id != changed_by_user_id:
            per_owner[c.owner_user_id] = per_owner.get(c.owner_user_id, 0) + 1
    if per_owner:
        from app.services import inbox  # noqa: PLC0415

        for uid, n in per_owner.items():
            await inbox.notify(db, org_id, [uid], category="leads", kind="lead_assigned",
                               title=f"{n} new lead{'s' if n != 1 else ''} imported and assigned to you", link="/crm?owner=me", actor_id=changed_by_user_id)
    return {
        "created": created, "updated": updated, "restored": restored, "skipped": skipped, "total_rows": total, "blocked": blocked,
        "limit": None if limit == -1 else limit, "errors": errors, "ignored_columns": ignored,
        "recognised_columns": [f for f in col],
        "sms_opted_in": sms_in, "whatsapp_opted_in": wa_in,
    }
