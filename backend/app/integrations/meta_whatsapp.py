"""WhatsApp Cloud API (Meta, direct). https://developers.facebook.com/docs/whatsapp/cloud-api

Platform credentials live in platform_services (code `meta_whatsapp`):
  access_token (permanent system-user token), phone_number_id, waba_id,
  app_secret (checks webhook signatures), verify_token (webhook handshake).

A business can only START a conversation with an approved template; free text
works only inside the 24 hours after the customer last wrote to you.
"""
import re

import httpx

from app.services.phone import normalize_bd_msisdn

GRAPH = "https://graph.facebook.com/v21.0"

# Meta error codes -> something a person can act on.
ERRORS = {
    190: "The access token is invalid or expired. Create a new permanent token in Meta Business settings.",
    10: "The token has no permission for WhatsApp (needs whatsapp_business_messaging).",
    100: "Meta rejected a parameter (check the phone number ID and template name).",
    130429: "Sending too fast — Meta rate limit. Try again shortly.",
    131000: "WhatsApp had an error. Try again shortly.",
    131026: "This number can't receive WhatsApp messages.",
    131030: "The recipient isn't on the allowed list yet (your WhatsApp app is still in test mode).",
    131042: "The Meta business payment method is missing or invalid.",
    131047: "More than 24 hours since this customer last wrote. Use an approved template instead of free text.",
    131048: "Meta limited sending because of spam reports.",
    131049: "Meta didn't deliver this to protect the user experience. Try again later.",
    131051: "Unsupported message type.",
    131056: "Too many messages to this person at once. Try again shortly.",
    132000: "The template variables don't match what the template expects.",
    132001: "That template doesn't exist or isn't approved in this language.",
    132005: "The translated template text is too long.",
    132007: "The template breaks WhatsApp's content policy.",
    132012: "A template variable has the wrong format.",
    132015: "The template is paused because of quality.",
    132016: "The template is disabled because of quality.",
    133010: "The phone number isn't registered on the WhatsApp Cloud API.",
}


class MetaWhatsAppError(Exception):
    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code


def to_wa_number(phone: str) -> str:
    """Meta wants digits only, with country code and no plus: 8801712345678."""
    return re.sub(r"\D", "", normalize_bd_msisdn(phone))


async def _call(creds: dict, method: str, path: str, **kw) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.request(method, f"{GRAPH}/{path}", headers={"Authorization": f"Bearer {creds['access_token']}"}, **kw)
    try:
        data = r.json()
    except ValueError as e:
        raise MetaWhatsAppError(f"Unexpected reply from Meta (HTTP {r.status_code}).") from e
    if r.status_code >= 400 or "error" in data:
        err = data.get("error") or {}
        code = err.get("code")
        detail = (err.get("error_data") or {}).get("details") or err.get("message") or f"HTTP {r.status_code}"
        raise MetaWhatsAppError(ERRORS.get(code) or f"Meta: {detail}", code)
    return data


async def send_text(creds: dict, *, to: str, body: str, phone_number_id: str | None = None) -> str:
    data = await _call(creds, "POST", f"{phone_number_id or creds['phone_number_id']}/messages", json={
        "messaging_product": "whatsapp", "to": to_wa_number(to), "type": "text", "text": {"body": body, "preview_url": False}})
    return data["messages"][0]["id"]


async def send_template(creds: dict, *, to: str, name: str, language: str, params: list[str] | None = None,
                        phone_number_id: str | None = None) -> str:
    template: dict = {"name": name, "language": {"code": language}}
    if params:
        template["components"] = [{"type": "body", "parameters": [{"type": "text", "text": (p or "-")[:1000]} for p in params]}]
    data = await _call(creds, "POST", f"{phone_number_id or creds['phone_number_id']}/messages", json={
        "messaging_product": "whatsapp", "to": to_wa_number(to), "type": "template", "template": template})
    return data["messages"][0]["id"]


async def phone_info(creds: dict) -> dict:
    return await _call(creds, "GET", creds["phone_number_id"], params={"fields": "display_phone_number,verified_name,quality_rating,code_verification_status"})


async def list_templates(creds: dict) -> list[dict]:
    """Approved templates: [{name, language, category, body, params}] (params = how many {{n}} the body has)."""
    data = await _call(creds, "GET", f"{creds['waba_id']}/message_templates", params={"limit": 200, "fields": "name,language,status,category,components"})
    out = []
    for t in data.get("data", []):
        if t.get("status") != "APPROVED":
            continue
        body = next((c.get("text", "") for c in t.get("components", []) if c.get("type") == "BODY"), "")
        out.append({"name": t["name"], "language": t["language"], "category": (t.get("category") or "").lower(), "body": body,
                    "params": len(set(re.findall(r"\{\{(\d+)\}\}", body)))})
    return sorted(out, key=lambda x: (x["name"], x["language"]))


async def create_template(creds: dict, *, name: str, language: str, category: str, body: str, examples: list[str]) -> dict:
    """Submit a new template to Meta for review. Returns {id, status, category}."""
    component: dict = {"type": "BODY", "text": body}
    if examples:
        component["example"] = {"body_text": [examples]}
    return await _call(creds, "POST", f"{creds['waba_id']}/message_templates", json={
        "name": name, "language": language, "category": category.upper(), "components": [component]})


async def template_status(creds: dict, meta_name: str) -> list[dict]:
    """Current status of one template name (one row per language): [{id, status, language, rejected_reason}]."""
    data = await _call(creds, "GET", f"{creds['waba_id']}/message_templates", params={"name": meta_name, "fields": "id,name,status,language,rejected_reason"})
    return data.get("data", [])
