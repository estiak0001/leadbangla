import csv
import io
import uuid
from datetime import datetime, timezone

from sqlalchemy import Select, and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.exceptions import PlanLimitError
from app.models.contact import Contact
from app.models.contact_history import ContactHistory
from app.models.crm import ContactNote
from app.models.event import Event
from app.models.landing_page import FormSubmission
from app.models.segment import Segment, SegmentHistory
from app.models.sms import SmsEvent, SmsSkipEvent
from app.models.tag_preset import TagPreset
from app.models.user import User
from app.models.workflow import WorkflowEnrollment, WorkflowStepLog
from app.schemas.audience import SegmentRule
from app.services.plan_service import get_plan_limit

# Suggested out-of-the-box for every new organization so the tag picker
# isn't empty before any contact has been tagged.
FEATURED_TAG_PRESETS = ["VIP", "Lead", "Customer", "Newsletter", "Trial", "Prospect"]

# Contact fields tracked in the audit history / eligible for reverting.
_TRACKED_FIELDS = ("email", "phone", "first_name", "last_name", "tags")
_EXTRA_FIELDS = (
    "company", "address", "city", "division", "district", "area", "source", "whatsapp_number", "facebook_url", "customer_type",
    "sms_opt_in", "whatsapp_opt_in", "owner_user_id", "deal_value", "expected_close_date", "custom_fields", "latitude", "longitude",
)


class SegmentNotFoundError(Exception):
    pass


class TagPresetExistsError(Exception):
    pass


class TagPresetNotFoundError(Exception):
    pass


class ContactNotFoundError(Exception):
    pass


class ContactHistoryNotFoundError(Exception):
    pass


def _contact_snapshot(contact: Contact) -> dict:
    return {field: getattr(contact, field) for field in _TRACKED_FIELDS}


def _diff_snapshots(before: dict, after: dict) -> dict:
    return {
        field: {"old": before[field], "new": after[field]}
        for field in _TRACKED_FIELDS
        if before[field] != after[field]
    }


async def _record_history(
    db: AsyncSession,
    org_id: uuid.UUID,
    contact_id: uuid.UUID,
    changed_by_user_id: uuid.UUID | None,
    action: str,
    changes: dict,
    source_history_id: uuid.UUID | None = None,
) -> None:
    db.add(
        ContactHistory(
            organization_id=org_id,
            contact_id=contact_id,
            changed_by_user_id=changed_by_user_id,
            action=action,
            changes=changes,
            source_history_id=source_history_id,
        )
    )


def _rule_condition(rule: SegmentRule) -> ColumnElement[bool]:
    from app.services.segment_rules import rule_condition  # noqa: PLC0415

    return rule_condition(rule)


def _build_conditions(
    org_id: uuid.UUID, rules: list[SegmentRule], match_type: str = "all"
) -> list[ColumnElement[bool]]:
    base = [Contact.organization_id == org_id, Contact.deleted_at.is_(None)]
    if not rules:
        return base
    rule_conditions = [_rule_condition(rule) for rule in rules]
    combinator = or_ if match_type == "any" else and_
    return [*base, combinator(*rule_conditions)]


def build_segment_query(org_id: uuid.UUID, rules: list[SegmentRule], match_type: str = "all") -> Select:
    return select(Contact).where(*_build_conditions(org_id, rules, match_type))


async def count_matching_contacts(
    db: AsyncSession, org_id: uuid.UUID, rules: list[SegmentRule], match_type: str = "all"
) -> int:
    query = select(func.count()).select_from(Contact).where(*_build_conditions(org_id, rules, match_type))
    return await db.scalar(query) or 0


async def list_matching_contacts(
    db: AsyncSession, org_id: uuid.UUID, rules: list[SegmentRule], limit: int = 500, match_type: str = "all"
) -> list[Contact]:
    query = build_segment_query(org_id, rules, match_type).order_by(Contact.created_at.desc()).limit(limit)
    result = await db.scalars(query)
    return list(result)


async def find_duplicate(
    db: AsyncSession, org_id: uuid.UUID, email: str | None, phone: str | None, exclude_id: uuid.UUID | None = None
) -> Contact | None:
    """An existing (non-trashed) contact with the same email, or the same phone in any format."""
    from app.services.contact_import import _phone_key  # noqa: PLC0415

    conds = []
    if email:
        conds.append(func.lower(Contact.email) == email.strip().lower())
    key = _phone_key(phone) if phone else None
    if not conds and not key:
        return None
    rows = await db.scalars(
        select(Contact).where(Contact.organization_id == org_id, Contact.deleted_at.is_(None))
        .where(or_(*conds) if conds else Contact.phone.isnot(None))
    )
    for c in rows:
        if exclude_id and c.id == exclude_id:
            continue
        if email and c.email and c.email.lower() == email.strip().lower():
            return c
        if key and c.phone and _phone_key(c.phone) == key:
            return c
    if key and conds:      # phone may match a row the email filter excluded
        for c in await db.scalars(select(Contact).where(
                Contact.organization_id == org_id, Contact.deleted_at.is_(None), Contact.phone.isnot(None))):
            if (not exclude_id or c.id != exclude_id) and _phone_key(c.phone) == key:
                return c
    return None


async def create_contact(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    email: str | None = None,
    phone: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    tags: list[str] | None = None,
    changed_by_user_id: uuid.UUID | None = None,
    actor_role: str | None = None,
    extra: dict | None = None,
) -> Contact:
    from app.services import crm_sales_service, crm_service  # noqa: PLC0415  (avoid import cycle)

    limit = await get_plan_limit(db, org_id, "contacts_limit")
    if limit != -1:
        count = await db.scalar(
            select(func.count(Contact.id)).where(
                Contact.organization_id == org_id, Contact.deleted_at.is_(None)
            )
        )
        if (count or 0) >= limit:
            raise PlanLimitError("contacts", count or 0, limit)

    contact = Contact(
        organization_id=org_id,
        email=email,
        phone=phone,
        first_name=first_name,
        last_name=last_name,
        tags=tags or [],
    )
    for k, v in (extra or {}).items():
        if k in _EXTRA_FIELDS and v not in (None, ""):
            setattr(contact, k, v)
    assigner = await crm_service.LeadAssigner.create(db, org_id, changed_by_user_id, actor_role)
    assigner.apply(contact)
    db.add(contact)
    await db.flush()
    await assigner.finish(db)
    if contact.sms_opt_in:
        crm_sales_service.log_consent(db, org_id, contact.id, "sms", True, "manual", changed_by_user_id)
    if contact.whatsapp_opt_in:
        crm_sales_service.log_consent(db, org_id, contact.id, "whatsapp", True, "manual", changed_by_user_id)

    empty = {field: None if field != "tags" else [] for field in _TRACKED_FIELDS}
    changes = _diff_snapshots(empty, _contact_snapshot(contact))
    if changes:
        await _record_history(db, org_id, contact.id, changed_by_user_id, "created", changes)

    await db.commit()
    await db.refresh(contact)
    if contact.owner_user_id and contact.owner_user_id != changed_by_user_id:
        from app.services import inbox  # noqa: PLC0415

        await inbox.notify(db, org_id, [contact.owner_user_id], category="leads", kind="lead_assigned",
                           title=f"New lead for you: {contact.first_name or contact.company or contact.email or contact.phone}",
                           link=f"/contacts/{contact.id}", actor_id=changed_by_user_id)
    # Lazy import avoids circular dependency at module-load time.
    from app.workers.workflow_runner import fire_workflow_trigger_task  # noqa: PLC0415
    fire_workflow_trigger_task.delay(str(org_id), "contact_created", str(contact.id), {})
    return contact


async def list_contacts(db: AsyncSession, org_id: uuid.UUID, limit: int = 200, owner_user_id: uuid.UUID | None = None) -> list[Contact]:
    conds = [Contact.organization_id == org_id, Contact.deleted_at.is_(None)]
    if owner_user_id is not None:
        conds.append(Contact.owner_user_id == owner_user_id)
    result = await db.scalars(
        select(Contact)
        .where(*conds)
        .order_by(Contact.created_at.desc())
        .limit(limit)
    )
    return list(result)


async def get_contact(db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID) -> Contact:
    contact = await db.scalar(
        select(Contact).where(
            Contact.organization_id == org_id, Contact.id == contact_id, Contact.deleted_at.is_(None)
        )
    )
    if contact is None:
        raise ContactNotFoundError(contact_id)
    return contact


async def update_contact(
    db: AsyncSession,
    org_id: uuid.UUID,
    contact_id: uuid.UUID,
    *,
    email: str | None = None,
    phone: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    tags: list[str] | None = None,
    changed_by_user_id: uuid.UUID | None = None,
) -> Contact:
    contact = await get_contact(db, org_id, contact_id)
    before = _contact_snapshot(contact)

    contact.email = email
    contact.phone = phone
    contact.first_name = first_name
    contact.last_name = last_name
    if tags is not None:
        contact.tags = tags

    changes = _diff_snapshots(before, _contact_snapshot(contact))
    if changes:
        await _record_history(db, org_id, contact_id, changed_by_user_id, "updated", changes)

    await db.commit()
    await db.refresh(contact)
    return contact


async def list_contact_history(db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID) -> list[dict]:
    rows = await db.execute(
        select(ContactHistory, User.email)
        .outerjoin(User, User.id == ContactHistory.changed_by_user_id)
        .where(ContactHistory.organization_id == org_id, ContactHistory.contact_id == contact_id)
        .order_by(ContactHistory.created_at.desc())
    )
    return [
        {
            "id": history.id,
            "action": history.action,
            "changes": history.changes,
            "changed_by_user_id": history.changed_by_user_id,
            "changed_by_email": email,
            "source_history_id": history.source_history_id,
            "created_at": history.created_at,
        }
        for history, email in rows
    ]


async def revert_contact_history(
    db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID, history_id: uuid.UUID, changed_by_user_id: uuid.UUID | None = None
) -> Contact:
    contact = await get_contact(db, org_id, contact_id)
    entry = await db.scalar(
        select(ContactHistory).where(
            ContactHistory.id == history_id,
            ContactHistory.organization_id == org_id,
            ContactHistory.contact_id == contact_id,
        )
    )
    if entry is None or not entry.changes or not any(f in entry.changes for f in _TRACKED_FIELDS):
        raise ContactHistoryNotFoundError(history_id)

    before = _contact_snapshot(contact)
    for field, change in entry.changes.items():
        if field in _TRACKED_FIELDS:
            setattr(contact, field, change["old"])

    changes = _diff_snapshots(before, _contact_snapshot(contact))
    if changes:
        await _record_history(db, org_id, contact_id, changed_by_user_id, "reverted", changes, source_history_id=history_id)

    await db.commit()
    await db.refresh(contact)
    return contact


async def soft_delete_contacts(
    db: AsyncSession, org_id: uuid.UUID, contact_ids: list[uuid.UUID], changed_by_user_id: uuid.UUID | None = None
) -> int:
    result = await db.scalars(
        select(Contact).where(
            Contact.organization_id == org_id,
            Contact.id.in_(contact_ids),
            Contact.deleted_at.is_(None),
        )
    )
    contacts = list(result)
    now = datetime.now(timezone.utc)
    for contact in contacts:
        contact.deleted_at = now
        await _record_history(db, org_id, contact.id, changed_by_user_id, "deleted", {})
    await db.commit()
    return len(contacts)


async def soft_delete_contacts_by_tag(
    db: AsyncSession, org_id: uuid.UUID, tag: str, changed_by_user_id: uuid.UUID | None = None
) -> int:
    result = await db.scalars(
        select(Contact).where(
            Contact.organization_id == org_id,
            Contact.tags.any(tag),
            Contact.deleted_at.is_(None),
        )
    )
    contacts = list(result)
    now = datetime.now(timezone.utc)
    for contact in contacts:
        contact.deleted_at = now
        await _record_history(db, org_id, contact.id, changed_by_user_id, "deleted", {"tag": {"old": None, "new": tag}})
    await db.commit()
    return len(contacts)


async def list_trashed_contacts(db: AsyncSession, org_id: uuid.UUID, limit: int = 200) -> list[Contact]:
    result = await db.scalars(
        select(Contact)
        .where(Contact.organization_id == org_id, Contact.deleted_at.isnot(None))
        .order_by(Contact.deleted_at.desc())
        .limit(limit)
    )
    return list(result)


class ContactRestoreConflictError(Exception):
    """A live contact already uses this email/phone."""


async def restore_contact(
    db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID, changed_by_user_id: uuid.UUID | None = None
) -> Contact:
    contact = await db.scalar(
        select(Contact).where(
            Contact.organization_id == org_id, Contact.id == contact_id, Contact.deleted_at.isnot(None)
        )
    )
    if contact is None:
        raise ContactNotFoundError(contact_id)
    # Someone may have added the same person since — don't end up with two.
    clash = None
    if contact.email:
        clash = await db.scalar(select(Contact).where(Contact.organization_id == org_id, Contact.deleted_at.is_(None), func.lower(Contact.email) == contact.email.lower()))
    if clash is None and contact.phone:
        clash = await db.scalar(select(Contact).where(Contact.organization_id == org_id, Contact.deleted_at.is_(None), Contact.phone == contact.phone))
    if clash is not None:
        raise ContactRestoreConflictError(clash.email or clash.phone or "")
    limit = await get_plan_limit(db, org_id, "contacts_limit")
    if limit != -1:
        live = await db.scalar(select(func.count(Contact.id)).where(Contact.organization_id == org_id, Contact.deleted_at.is_(None)))
        if (live or 0) >= limit:
            raise PlanLimitError("contacts", live or 0, limit)
    contact.deleted_at = None
    await _record_history(db, org_id, contact_id, changed_by_user_id, "restored", {})
    await db.commit()
    await db.refresh(contact)
    return contact


async def purge_contact(db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID) -> None:
    contact = await db.scalar(
        select(Contact).where(
            Contact.organization_id == org_id, Contact.id == contact_id, Contact.deleted_at.isnot(None)
        )
    )
    if contact is None:
        raise ContactNotFoundError(contact_id)

    # Rows with a NOT NULL / non-cascading FK to contacts must be removed first,
    # or the delete below violates a foreign key constraint (verified against
    # the live schema — several of these are NO ACTION, not CASCADE).
    enrollment_ids = list(
        await db.scalars(select(WorkflowEnrollment.id).where(WorkflowEnrollment.contact_id == contact_id))
    )
    if enrollment_ids:
        await db.execute(delete(WorkflowStepLog).where(WorkflowStepLog.enrollment_id.in_(enrollment_ids)))
    await db.execute(delete(WorkflowEnrollment).where(WorkflowEnrollment.contact_id == contact_id))
    await db.execute(delete(ContactNote).where(ContactNote.contact_id == contact_id))
    await db.execute(delete(SmsSkipEvent).where(SmsSkipEvent.contact_id == contact_id))

    # Nullable FKs: detach rather than delete, so campaign/engagement history stays intact.
    await db.execute(update(SmsEvent).where(SmsEvent.contact_id == contact_id).values(contact_id=None))
    await db.execute(update(Event).where(Event.contact_id == contact_id).values(contact_id=None))
    await db.execute(update(FormSubmission).where(FormSubmission.contact_id == contact_id).values(contact_id=None))

    await db.delete(contact)
    await db.commit()


async def import_contacts_csv(db: AsyncSession, org_id: uuid.UUID, file_bytes: bytes) -> dict:
    from app.services.contact_import import import_contacts_csv as run  # noqa: PLC0415

    return await run(db, org_id, file_bytes)


class SegmentNameTakenError(Exception):
    pass


class SegmentInUseError(Exception):
    def __init__(self, used_in: int):
        super().__init__(used_in)
        self.used_in = used_in


_SEG_FIELDS = ("name", "description", "match_type", "rules")


def _snapshot(seg: Segment) -> dict:
    return {"name": seg.name, "description": seg.description, "match_type": seg.match_type, "rules": seg.rules}


def _seg_diff(before: dict, after: dict) -> dict:
    return {f: {"old": before.get(f), "new": after.get(f)} for f in _SEG_FIELDS if before.get(f) != after.get(f)}


def _log_segment(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID, user_id: uuid.UUID | None, action: str, changes: dict | None = None) -> None:
    db.add(SegmentHistory(organization_id=org_id, segment_id=segment_id, user_id=user_id, action=action, changes=changes or {}))


async def _check_name(db: AsyncSession, org_id: uuid.UUID, name: str, *, is_template: bool = False, exclude: uuid.UUID | None = None) -> str:
    """Names are unique among live segments, and (separately) among live templates."""
    name = " ".join(name.split())
    q = select(Segment.id).where(Segment.organization_id == org_id, Segment.deleted_at.is_(None), Segment.is_template.is_(is_template),
                                 func.lower(Segment.name) == name.lower())
    if exclude:
        q = q.where(Segment.id != exclude)
    if await db.scalar(q) is not None:
        raise SegmentNameTakenError(name)
    return name


async def create_segment(
    db: AsyncSession, org_id: uuid.UUID, name: str, rules: list[SegmentRule], match_type: str = "all",
    description: str | None = None, *, user_id: uuid.UUID | None = None, is_template: bool = False,
) -> Segment:
    name = await _check_name(db, org_id, name, is_template=is_template)
    segment = Segment(
        organization_id=org_id, name=name, rules=[r.model_dump() for r in rules], match_type=match_type,
        description=(description or "").strip() or None, is_template=is_template,
    )
    db.add(segment)
    await db.flush()
    _log_segment(db, org_id, segment.id, user_id, "created", _seg_diff({}, _snapshot(segment)))
    await db.commit()
    await db.refresh(segment)
    return segment


async def segment_reach(db: AsyncSession, org_id: uuid.UUID, rules: list[SegmentRule], match_type: str = "all") -> dict:
    """How many of the matching people can be reached on each channel (one query)."""
    conds = _build_conditions(org_id, rules, match_type)
    row = (await db.execute(
        select(
            func.count(Contact.id),
            func.count(Contact.id).filter(Contact.email.isnot(None)),
            func.count(Contact.id).filter(Contact.phone.isnot(None)),
            func.count(Contact.id).filter(Contact.phone.isnot(None), Contact.sms_opt_in.is_(True)),
            func.count(Contact.id).filter(Contact.phone.isnot(None), Contact.whatsapp_opt_in.is_(True)),
            func.count(Contact.id).filter(Contact.latitude.isnot(None), Contact.longitude.isnot(None)),
        ).where(*conds)
    )).one()
    return dict(zip(("total", "email", "phone", "sms", "whatsapp", "located"), (int(x or 0) for x in row)))


async def segment_usage(db: AsyncSession, org_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """segment_id -> number of campaigns (email, SMS/WhatsApp, push) that use it."""
    from app.models.campaign import Campaign  # noqa: PLC0415
    from app.models.push import PushCampaign  # noqa: PLC0415
    from app.models.sms import SmsCampaign  # noqa: PLC0415

    out: dict[uuid.UUID, int] = {}
    for model, extra in ((Campaign, [Campaign.deleted_at.is_(None)]), (SmsCampaign, []), (PushCampaign, [])):
        rows = await db.execute(select(model.segment_id, func.count()).where(model.organization_id == org_id, model.segment_id.isnot(None), *extra).group_by(model.segment_id))
        for sid, n in rows:
            out[sid] = out.get(sid, 0) + n
    return out


async def get_segment(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID, *, include_deleted: bool = False) -> Segment:
    q = select(Segment).where(Segment.organization_id == org_id, Segment.id == segment_id)
    if not include_deleted:
        q = q.where(Segment.deleted_at.is_(None))
    segment = await db.scalar(q)
    if segment is None:
        raise SegmentNotFoundError(segment_id)
    return segment


async def list_segments(db: AsyncSession, org_id: uuid.UUID) -> list[Segment]:
    result = await db.scalars(
        select(Segment).where(Segment.organization_id == org_id, Segment.deleted_at.is_(None), Segment.is_template.is_(False))
        .order_by(Segment.created_at.desc())
    )
    return list(result)


async def list_trashed_segments(db: AsyncSession, org_id: uuid.UUID) -> list[Segment]:
    return list(await db.scalars(
        select(Segment).where(Segment.organization_id == org_id, Segment.deleted_at.isnot(None)).order_by(Segment.deleted_at.desc())))


async def update_segment(
    db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID, name: str, rules: list[SegmentRule],
    match_type: str = "all", description: str | None = None, *, user_id: uuid.UUID | None = None,
) -> Segment:
    segment = await get_segment(db, org_id, segment_id)
    before = _snapshot(segment)
    segment.name = await _check_name(db, org_id, name, is_template=segment.is_template, exclude=segment_id)
    segment.description = (description or "").strip() or None
    segment.rules = [r.model_dump() for r in rules]
    segment.match_type = match_type
    changes = _seg_diff(before, _snapshot(segment))
    if changes:
        _log_segment(db, org_id, segment_id, user_id, "updated", changes)
    await db.commit()
    await db.refresh(segment)
    return segment


async def trash_segment(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID, user_id: uuid.UUID | None = None) -> int:
    """Soft delete: the segment leaves every list but can be restored. Returns how many campaigns still use it."""
    segment = await get_segment(db, org_id, segment_id)
    segment.deleted_at = datetime.now(timezone.utc)
    _log_segment(db, org_id, segment_id, user_id, "deleted")
    await db.commit()
    return (await segment_usage(db, org_id)).get(segment_id, 0)


async def restore_segment(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Segment:
    segment = await get_segment(db, org_id, segment_id, include_deleted=True)
    if segment.deleted_at is None:
        return segment
    try:
        await _check_name(db, org_id, segment.name, is_template=segment.is_template, exclude=segment_id)
    except SegmentNameTakenError:     # someone made a new one with this name meanwhile
        segment.name = f"{segment.name} (restored)"[:200]
    segment.deleted_at = None
    _log_segment(db, org_id, segment_id, user_id, "restored")
    await db.commit()
    await db.refresh(segment)
    return segment


async def purge_segment(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID) -> None:
    """Permanent delete (from the trash). Refused while a campaign still points at it."""
    segment = await get_segment(db, org_id, segment_id, include_deleted=True)
    if segment.deleted_at is None:
        raise SegmentNotFoundError(segment_id)
    used = (await segment_usage(db, org_id)).get(segment_id, 0)
    if used:
        raise SegmentInUseError(used)
    await db.delete(segment)
    await db.commit()


async def duplicate_segment(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID, user_id: uuid.UUID | None = None, *, as_template: bool | None = None) -> Segment:
    """Copy a segment. `as_template=True` turns it into a reusable template; False makes a live segment from a template."""
    src = await get_segment(db, org_id, segment_id)
    is_tpl = src.is_template if as_template is None else as_template
    base = src.name if (as_template is not None and as_template != src.is_template) else f"{src.name} (copy)"
    n, name = 1, base
    while True:
        try:
            name = await _check_name(db, org_id, name, is_template=is_tpl)
            break
        except SegmentNameTakenError:
            n += 1
            name = f"{base} {n}"
    seg = Segment(organization_id=org_id, name=name, rules=src.rules, match_type=src.match_type, description=src.description, is_template=is_tpl)
    db.add(seg)
    await db.flush()
    _log_segment(db, org_id, seg.id, user_id, "created", {"copied_from": {"old": None, "new": src.name}})
    await db.commit()
    await db.refresh(seg)
    return seg


async def list_segment_history(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID) -> list[dict]:
    await get_segment(db, org_id, segment_id, include_deleted=True)
    rows = await db.execute(
        select(SegmentHistory, User.email).outerjoin(User, User.id == SegmentHistory.user_id)
        .where(SegmentHistory.organization_id == org_id, SegmentHistory.segment_id == segment_id)
        .order_by(SegmentHistory.created_at.desc()).limit(100))
    return [{"id": h.id, "action": h.action, "changes": h.changes, "changed_by_email": email, "created_at": h.created_at} for h, email in rows]


async def revert_segment(db: AsyncSession, org_id: uuid.UUID, segment_id: uuid.UUID, history_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Segment:
    """Undo one 'updated' entry: put the old values of whatever it changed back."""
    segment = await get_segment(db, org_id, segment_id)
    entry = await db.scalar(select(SegmentHistory).where(SegmentHistory.id == history_id, SegmentHistory.segment_id == segment_id,
                                                         SegmentHistory.organization_id == org_id))
    if entry is None or entry.action not in ("updated", "reverted") or not any(f in entry.changes for f in _SEG_FIELDS):
        raise SegmentNotFoundError(history_id)
    before = _snapshot(segment)
    if "name" in entry.changes:
        segment.name = await _check_name(db, org_id, entry.changes["name"]["old"] or segment.name, is_template=segment.is_template, exclude=segment_id)
    if "description" in entry.changes:
        segment.description = entry.changes["description"]["old"]
    if "match_type" in entry.changes:
        segment.match_type = entry.changes["match_type"]["old"]
    if "rules" in entry.changes:
        segment.rules = entry.changes["rules"]["old"]
    changes = _seg_diff(before, _snapshot(segment))
    if changes:
        _log_segment(db, org_id, segment_id, user_id, "reverted", changes)
    await db.commit()
    await db.refresh(segment)
    return segment


async def _seed_templates(db: AsyncSession, org_id: uuid.UUID, *, force: bool = False) -> int:
    """First open of Quick start: copy the starter templates into the company. `force` adds back any that are missing."""
    from app.data.segment_templates import DEFAULT_TEMPLATES  # noqa: PLC0415
    from app.services.crm_service import ensure_initialized  # noqa: PLC0415

    settings = await ensure_initialized(db, org_id)
    if settings.segment_templates_seeded and not force:
        return 0
    have = {n.lower() for n in await db.scalars(select(Segment.name).where(
        Segment.organization_id == org_id, Segment.is_template.is_(True), Segment.deleted_at.is_(None)))}
    added = 0
    for t in DEFAULT_TEMPLATES:
        if t["name"].lower() not in have:
            seg = Segment(organization_id=org_id, name=t["name"], description=t["description"], match_type=t["match_type"], rules=t["rules"], is_template=True)
            db.add(seg)
            await db.flush()
            _log_segment(db, org_id, seg.id, None, "created", {"name": {"old": None, "new": t["name"]}})
            added += 1
    settings.segment_templates_seeded = True
    await db.commit()
    return added


async def list_templates(db: AsyncSession, org_id: uuid.UUID) -> list[Segment]:
    await _seed_templates(db, org_id)
    return list(await db.scalars(select(Segment).where(
        Segment.organization_id == org_id, Segment.is_template.is_(True), Segment.deleted_at.is_(None)).order_by(Segment.created_at)))


async def restore_default_templates(db: AsyncSession, org_id: uuid.UUID) -> int:
    return await _seed_templates(db, org_id, force=True)


async def list_segments_for_contact(db: AsyncSession, org_id: uuid.UUID, contact_id: uuid.UUID) -> list[Segment]:
    """Saved segments whose rules the given contact currently satisfies."""
    segments = await list_segments(db, org_id)
    matched: list[Segment] = []
    for segment in segments:
        rules = [SegmentRule(**r) for r in segment.rules]
        conditions = _build_conditions(org_id, rules, segment.match_type)
        is_match = await db.scalar(
            select(func.count()).select_from(Contact).where(Contact.id == contact_id, *conditions)
        )
        if is_match:
            matched.append(segment)
    return matched


async def seed_default_tag_presets(db: AsyncSession, org_id: uuid.UUID) -> None:
    """Give a brand-new organization a starter set of featured tags to pick from."""
    for name in FEATURED_TAG_PRESETS:
        db.add(TagPreset(organization_id=org_id, name=name))
    await db.flush()


async def create_tag_preset(db: AsyncSession, org_id: uuid.UUID, name: str) -> TagPreset:
    normalized = name.strip()
    existing = await db.scalar(
        select(TagPreset).where(
            TagPreset.organization_id == org_id, func.lower(TagPreset.name) == normalized.lower()
        )
    )
    if existing is not None:
        raise TagPresetExistsError(normalized)

    preset = TagPreset(organization_id=org_id, name=normalized)
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return preset


async def list_tag_presets(db: AsyncSession, org_id: uuid.UUID) -> list[TagPreset]:
    result = await db.scalars(
        select(TagPreset).where(TagPreset.organization_id == org_id).order_by(TagPreset.name)
    )
    return list(result)


async def delete_tag_preset(db: AsyncSession, org_id: uuid.UUID, preset_id: uuid.UUID) -> None:
    preset = await db.scalar(
        select(TagPreset).where(TagPreset.organization_id == org_id, TagPreset.id == preset_id)
    )
    if preset is None:
        raise TagPresetNotFoundError(preset_id)
    await db.delete(preset)
    await db.commit()
