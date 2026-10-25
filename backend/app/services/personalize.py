"""Merge-tag substitution shared by email and SMS/WhatsApp sends."""
import re
from html import escape as html_escape

_TAG_RE = re.compile(r"\{\{\s*([a-z][a-z0-9_]*)\s*\}\}")


def personalize(text: str, contact, custom: dict[str, str] | None = None, *, escape: bool = True) -> str:
    """Fill {{tags}} for one recipient.

    The four contact tags (first_name, last_name, email, phone) always come from
    the contact and cannot be redefined. Any other {{key}} uses the org's custom
    tag value. Unknown/empty tags become "" so a raw {{tag}} never reaches a customer."""
    custom = custom or {}
    contact_values = {
        "first_name": contact.first_name, "last_name": contact.last_name,
        "email": contact.email, "phone": contact.phone,
    }

    def sub(match: re.Match) -> str:
        key = match.group(1)
        value = (contact_values.get(key) or "") if key in contact_values else custom.get(key, "")
        return html_escape(value) if escape else value

    return _TAG_RE.sub(sub, text)
