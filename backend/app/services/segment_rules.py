"""Segment rule catalog and SQL builder.

A rule is {field, operator, value?, value2?, values?}. The catalog says which operators each field supports,
so the API can validate rules and the UI can build its pickers from one source. Old rules saved before this
catalog existed (email/first_name/last_name/phone/tag with contains/equals/is_set/is_not_set) still work."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import Float, String, and_, case, cast, exists, func, not_, or_, select
from sqlalchemy.sql.elements import ColumnElement

from app.models.contact import Contact
from app.models.crm import CrmDue
from app.models.enums import EventType
from app.models.event import Event

# operator key -> label shown in the UI
OPERATOR_LABELS: dict[str, str] = {
    "contains": "contains", "not_contains": "doesn't contain", "equals": "is", "not_equals": "is not", "starts_with": "starts with",
    "in": "is any of", "is_set": "is filled in", "is_not_set": "is empty",
    "gt": "is more than", "lt": "is less than", "gte": "is at least", "lte": "is at most", "between": "is between",
    "in_last_days": "in the last … days", "not_in_last_days": "not in the last … days", "before": "is before", "after": "is after",
    "in_next_days": "in the next … days", "is_true": "is yes", "is_false": "is no", "never": "never",
    "has_any": "has any of", "has_all": "has all of",
}
TEXT_OPS = ["contains", "not_contains", "equals", "not_equals", "starts_with", "is_set", "is_not_set"]
SELECT_OPS = ["equals", "not_equals", "in", "is_set", "is_not_set"]
TAG_OPS = ["contains", "not_contains", "has_any", "has_all", "is_set", "is_not_set"]   # "contains" = has the tag
NUMBER_OPS = ["gt", "gte", "lt", "lte", "equals", "between", "is_set", "is_not_set"]
DATE_OPS = ["in_last_days", "not_in_last_days", "before", "after", "between", "is_set", "is_not_set"]
BOOL_OPS = ["is_true", "is_false"]
ENGAGE_OPS = ["in_last_days", "not_in_last_days", "never"]

TYPE_OPS = {"text": TEXT_OPS, "select": SELECT_OPS, "tags": TAG_OPS, "number": NUMBER_OPS, "date": DATE_OPS,
            "bool": BOOL_OPS, "engage": ENGAGE_OPS, "future": ["in_next_days", "before", "after", "between", "is_set", "is_not_set"]}

# key -> (label, group, type, column name or None for special fields)
FIELDS: dict[str, tuple[str, str, str, str | None]] = {
    "first_name": ("First name", "Person", "text", "first_name"), "last_name": ("Last name", "Person", "text", "last_name"),
    "email": ("Email", "Person", "text", "email"), "phone": ("Mobile", "Person", "text", "phone"),
    "company": ("Shop / company", "Person", "text", "company"), "address": ("Address", "Person", "text", "address"),
    "tag": ("Tags", "Person", "tags", "tags"),
    "division": ("Division", "Place", "select", "division"), "district": ("District", "Place", "select", "district"),
    "area": ("Area", "Place", "select", "area"), "has_location": ("Has a map pin", "Place", "bool", None),
    "customer_type": ("Retail / wholesale", "Business", "select", "customer_type"), "source": ("Source", "Business", "select", "source"),
    "owner": ("Owner", "Business", "select", "owner_user_id"), "stage": ("CRM stage", "Business", "select", "pipeline_stage_id"),
    "deal_value": ("Deal value (৳)", "Business", "number", "deal_value"), "expected_close_date": ("Expected close", "Business", "future", "expected_close_date"),
    "owes_money": ("Owes you money (dues)", "Business", "bool", None),
    "sms_opt_in": ("Agreed to SMS", "Consent", "bool", "sms_opt_in"), "whatsapp_opt_in": ("Agreed to WhatsApp", "Consent", "bool", "whatsapp_opt_in"),
    "created_at": ("Date added", "Activity", "date", "created_at"), "last_contacted_at": ("Last contacted", "Activity", "date", "last_contacted_at"),
    "email_opened": ("Opened an email", "Activity", "engage", None), "email_clicked": ("Clicked an email link", "Activity", "engage", None),
}
MAX_RULES = 20


def field_type(field: str) -> str | None:
    if field.startswith("cf:"):
        return "custom"
    f = FIELDS.get(field)
    return f[2] if f else None


def allowed_operators(field: str) -> list[str]:
    t = field_type(field)
    if t == "custom":
        return TEXT_OPS[:5] + ["in", "gt", "gte", "lt", "lte", "between", "is_set", "is_not_set"]
    return TYPE_OPS.get(t or "", [])


def validate_rule(field: str, operator: str, value: str | None, value2: str | None, values: list[str] | None) -> None:
    """Raises ValueError with a message a person can act on."""
    if field_type(field) is None:
        raise ValueError(f"Unknown field '{field}'")
    if operator not in allowed_operators(field):
        raise ValueError(f"'{OPERATOR_LABELS.get(operator, operator)}' can't be used with {FIELDS.get(field, (field,))[0]}")
    v = (value or "").strip()
    if operator in ("contains", "not_contains", "equals", "not_equals", "starts_with", "gt", "gte", "lt", "lte", "before", "after",
                    "in_last_days", "not_in_last_days", "in_next_days", "between") and not v:
        raise ValueError("Add a value for this rule")
    if operator == "between" and not (value2 or "").strip():
        raise ValueError("'between' needs two values")
    if operator in ("in", "has_any", "has_all") and not [x for x in (values or []) if x.strip()]:
        raise ValueError("Pick at least one value")
    if operator in ("in_last_days", "not_in_last_days", "in_next_days") and not v.isdigit():
        raise ValueError("Days must be a whole number")
    t = field_type(field)
    if t == "number" or (t == "custom" and operator in ("gt", "gte", "lt", "lte", "between")):
        for x in (v, (value2 or "").strip()):
            if x:
                try:
                    float(x)
                except ValueError:
                    raise ValueError("Enter a number")
    if operator in ("before", "after", "between") and t in ("date", "future"):
        for x in (v, (value2 or "").strip()):
            if x:
                try:
                    date.fromisoformat(x[:10])
                except ValueError:
                    raise ValueError("Dates should look like 2026-11-30")


def _uuid(v: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(v)
    except ValueError:
        return None


def _days_ago(n: str) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=int(n))


def _d(v: str) -> date:
    return date.fromisoformat(v[:10])


def rule_condition(rule) -> ColumnElement[bool]:
    f, op = rule.field, rule.operator
    v = (rule.value or "").strip()
    v2 = (rule.value2 or "").strip()
    vals = [x.strip() for x in (rule.values or []) if x.strip()]
    t = field_type(f)

    # ── tags ──
    if t == "tags":
        col = Contact.tags
        return {
            "contains": lambda: col.any(v), "not_contains": lambda: not_(col.any(v)),
            "has_any": lambda: col.overlap(vals), "has_all": lambda: col.contains(vals),
            "is_set": lambda: func.cardinality(col) > 0, "is_not_set": lambda: func.cardinality(col) == 0,
        }[op]()

    # ── engagement (any email campaign) ──
    if t == "engage":
        kind = EventType.OPENED if f == "email_opened" else EventType.CLICKED
        base = [Event.contact_id == Contact.id, Event.type == kind]
        if op == "in_last_days":
            return exists().where(*base, Event.occurred_at >= _days_ago(v))
        if op == "not_in_last_days":
            return not_(exists().where(*base, Event.occurred_at >= _days_ago(v)))
        return not_(exists().where(*base))                                                     # never

    # ── special booleans ──
    if f == "has_location":
        cond = and_(Contact.latitude.isnot(None), Contact.longitude.isnot(None))
        return cond if op == "is_true" else not_(cond)
    if f == "owes_money":
        owing = select(CrmDue.contact_id).group_by(CrmDue.contact_id).having(
            func.sum(case((CrmDue.kind == "due", CrmDue.amount), else_=-CrmDue.amount)) > 0)
        return Contact.id.in_(owing) if op == "is_true" else not_(Contact.id.in_(owing))
    if t == "bool":
        col = getattr(Contact, FIELDS[f][3])  # type: ignore[arg-type]
        return col.is_(True) if op == "is_true" else col.isnot(True)

    # ── custom fields (stored as JSON text) ──
    if t == "custom":
        key = f[3:]
        txt = Contact.custom_fields[key].astext
        num = cast(txt, Float)
        return {
            "contains": lambda: txt.ilike(f"%{v}%"), "not_contains": lambda: func.coalesce(txt, "").not_ilike(f"%{v}%"),
            "equals": lambda: func.lower(txt) == v.lower(), "not_equals": lambda: func.coalesce(func.lower(txt), "") != v.lower(),
            "starts_with": lambda: txt.ilike(f"{v}%"), "in": lambda: func.lower(txt).in_([x.lower() for x in vals]),
            "gt": lambda: num > float(v), "gte": lambda: num >= float(v), "lt": lambda: num < float(v), "lte": lambda: num <= float(v),
            "between": lambda: num.between(float(v), float(v2)),
            "is_set": lambda: txt.isnot(None), "is_not_set": lambda: txt.is_(None),
        }[op]()

    col = getattr(Contact, FIELDS[f][3])  # type: ignore[arg-type]

    # ── ids (owner, stage) ──
    if f in ("owner", "stage"):
        ids = [i for i in (_uuid(x) for x in ([v] if op in ("equals", "not_equals") else vals)) if i]
        if op in ("equals", "in"):
            return col.in_(ids) if ids else col.is_(None) & col.isnot(None)
        if op == "not_equals":
            return or_(col.is_(None), ~col.in_(ids)) if ids else col.isnot(None) | col.is_(None)
        return col.isnot(None) if op == "is_set" else col.is_(None)

    # ── numbers (deal value is typed in taka, stored in paisa) ──
    if t == "number":
        scale = 100 if f == "deal_value" else 1
        a = float(v) * scale if v else 0
        b = float(v2) * scale if v2 else 0
        return {"gt": lambda: col > a, "gte": lambda: col >= a, "lt": lambda: col < a, "lte": lambda: col <= a,
                "equals": lambda: col == a, "between": lambda: col.between(a, b),
                "is_set": lambda: col.isnot(None), "is_not_set": lambda: col.is_(None)}[op]()

    # ── dates ──
    if t in ("date", "future"):
        if f == "expected_close_date":
            today = date.today()
            if op == "in_next_days":
                return and_(col >= today, col <= today + timedelta(days=int(v)))
            lo, hi = (_d(v) if v else None), (_d(v2) if v2 else None)
        else:
            lo = datetime.combine(_d(v), datetime.min.time(), tzinfo=timezone.utc) if v and op in ("before", "after", "between") else None
            hi = datetime.combine(_d(v2), datetime.max.time(), tzinfo=timezone.utc) if v2 and op == "between" else None
        if op == "in_last_days":
            return col >= _days_ago(v)
        if op == "not_in_last_days":
            return or_(col.is_(None), col < _days_ago(v))
        if op == "before":
            return col < lo
        if op == "after":
            return col > lo
        if op == "between":
            return col.between(lo, hi)
        return col.isnot(None) if op == "is_set" else col.is_(None)

    # ── text and picklists ──
    if t in ("text", "select"):
        txt = cast(col, String)
        ci = func.lower(col) if f not in ("owner",) else col
        return {
            "contains": lambda: col.ilike(f"%{v}%"), "not_contains": lambda: func.coalesce(col, "").not_ilike(f"%{v}%"),
            "equals": lambda: ci == v.lower(), "not_equals": lambda: func.coalesce(ci, "") != v.lower(),
            "starts_with": lambda: col.ilike(f"{v}%"), "in": lambda: func.lower(col).in_([x.lower() for x in vals]),
            "is_set": lambda: and_(col.isnot(None), func.length(txt) > 0), "is_not_set": lambda: or_(col.is_(None), func.length(txt) == 0),
        }[op]()
    raise ValueError(f"Unsupported rule {f} {op}")
