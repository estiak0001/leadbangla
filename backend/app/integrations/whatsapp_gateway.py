"""One entry point for WhatsApp sending. Meta's Cloud API is used when it is switched on;
otherwise the older provider route (SSL Wireless) keeps working. If nothing is connected, sending
fails with a clear message — it never pretends to send."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.service_creds import get_live_creds
from app.integrations import meta_whatsapp as meta
from app.integrations.meta_whatsapp import MetaWhatsAppError
from app.integrations.sslwireless import sslwireless_client
from app.models.organization import Organization


NOT_CONNECTED = (
    "WhatsApp sending isn't connected on this platform yet, so nothing can be sent. "
    "Please contact support — an administrator needs to connect the WhatsApp Cloud API."
)


class WhatsAppNotConnectedError(Exception):
    def __init__(self) -> None:
        super().__init__(NOT_CONNECTED)


async def availability(db: AsyncSession, org_id: uuid.UUID) -> tuple[bool, str | None]:
    """Can this customer's WhatsApp messages really go out right now? (ok, reason-if-not)"""
    if await mode_for(db, org_id) == "off":
        return False, NOT_CONNECTED
    return True, None


async def sending_from(db: AsyncSession, org_id: uuid.UUID) -> dict:
    """Which number does this customer's WhatsApp come from? Plain words for the customer and admin."""
    org = await db.get(Organization, org_id)
    if await own_creds(db, org_id):
        return {"source": "own", "number": org.whatsapp_number, "message": f"Messages are sent from your own WhatsApp number {org.whatsapp_number}. Meta bills you directly."}
    m = await mode(db)
    if m == "off":
        return {"source": "none", "number": None, "message": NOT_CONNECTED}
    if m == "meta":
        if org and org.whatsapp_number_approved and org.whatsapp_phone_number_id:
            return {"source": "dedicated", "number": org.whatsapp_number, "message": f"Messages are sent from your dedicated number {org.whatsapp_number}."}
        return {"source": "shared", "number": None, "message": "Messages are sent from the shared platform WhatsApp number. Customers will see our business name, not your own number."}
    return {"source": "provider", "number": org.whatsapp_number if org else None, "message": "Messages are sent through the platform's WhatsApp provider."}


async def meta_creds(db: AsyncSession) -> dict | None:
    creds = await get_live_creds(db, "meta_whatsapp")
    return creds if creds and creds.get("access_token") and creds.get("phone_number_id") else None


async def meta_creds_any(db: AsyncSession) -> dict | None:
    """Saved Meta credentials whether or not the integration is switched live (needed to manage templates)."""
    from app.integrations.sms_gateway import stored_creds  # noqa: PLC0415

    creds = await stored_creds(db, "meta_whatsapp")
    return creds if creds.get("access_token") else None


async def own_creds(db: AsyncSession, org_id: uuid.UUID) -> dict | None:
    """The customer's own Meta account — used only once the platform has approved their number."""
    from app.core.cred_crypto import decrypt_creds  # noqa: PLC0415

    org = await db.get(Organization, org_id)
    if org is None or not org.whatsapp_meta_enc or not org.whatsapp_number_approved:
        return None
    creds = decrypt_creds(org.whatsapp_meta_enc)
    return creds if creds.get("access_token") and creds.get("phone_number_id") else None


async def mode_for(db: AsyncSession, org_id: uuid.UUID) -> str:
    return "meta" if await own_creds(db, org_id) else await mode(db)


async def mode(db: AsyncSession) -> str:
    """'meta' (templates needed), 'provider' (old route) or 'off' (simulated)."""
    if await meta_creds(db):
        return "meta"
    return "provider" if (await get_live_creds(db, "whatsapp_bsp") or await get_live_creds(db, "sslwireless")) else "off"


async def send_whatsapp(db: AsyncSession, *, org_id: uuid.UUID, to: str, message: str, template: dict | None = None) -> str:
    """Returns a message id. `template` = {name, language, params: [str]} (params already personalised)."""
    own = await own_creds(db, org_id)
    if own:       # the customer's own number and Meta account: they pay Meta directly
        if template:
            return await meta.send_template(own, to=to, name=template["name"], language=template.get("language") or "en", params=template.get("params") or [])
        return await meta.send_text(own, to=to, body=message)
    creds = await meta_creds(db)
    if creds is None:
        if await mode(db) == "off":
            raise WhatsAppNotConnectedError()
        return await sslwireless_client.send_whatsapp(db, to=to, message=message)
    org = await db.get(Organization, org_id)
    pid = (org.whatsapp_phone_number_id if org and org.whatsapp_number_approved else None) or creds["phone_number_id"]
    if template:
        return await meta.send_template(creds, to=to, name=template["name"], language=template.get("language") or "en",
                                        params=template.get("params") or [], phone_number_id=pid)
    return await meta.send_text(creds, to=to, body=message, phone_number_id=pid)
