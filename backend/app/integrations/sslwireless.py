import uuid

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.service_creds import get_live_creds
from app.services.phone import normalize_bd_msisdn


class SSLWirelessClient:
    """Wraps the SSL Wireless SMS & WhatsApp gateway API.

    SSL Wireless is a BTRC-recognized aggregator in Bangladesh, which is
    required for bulk commercial SMS (Twilio is not BTRC-recognized and is
    significantly more expensive per-message).

    Sending live commercial bulk SMS/WhatsApp requires a BTRC
    Masking/Non-masking ID tied to a Trade License + TIN — start that
    paperwork in parallel with building this step; the sandbox/fake mode
    below works without it.

    Credentials are resolved per call: the *connection* (api_token) comes
    from live credentials stored via the admin Integration Hub, then the
    SSLWIRELESS_API_TOKEN env var, then the fake gateway. The *Sender ID*
    (masking/non-masking) is a separate, per-org concern — see
    app.services.sms_service.resolve_effective_sender_id — and is always
    passed in explicitly by the caller, never read from these credentials.
    """

    SMS_URL = "https://sms.sslwireless.com/pushapi/dynamic/server.php"
    # WhatsApp endpoint provided by SSL Wireless when approved as BSP.
    WA_URL = "https://sms.sslwireless.com/whatsapp/send"

    @property
    def is_fake(self) -> bool:
        return settings.sslwireless_is_fake

    async def send_sms(self, db: AsyncSession, *, to: str, message: str, sender_id: str) -> str:
        """Returns a gateway message ID (real or fake).

        'to' must be in international format: +8801XXXXXXXXX
        'sender_id' is the BTRC-approved masking/non-masking ID to send under —
        callers must resolve it (org-approved vs platform non-masking default)
        before calling this.
        """
        creds = await get_live_creds(db, "sslwireless")
        if creds is None:
            return f"fake-sms-{uuid.uuid4().hex}"
        return await self.send_sms_with_creds(creds, to=to, message=message, sender_id=sender_id)

    async def send_sms_with_creds(self, creds: dict, *, to: str, message: str, sender_id: str) -> str:
        """Send through explicit credentials (used by the admin "send test SMS"
        so the connection can be proven before the integration is switched live)."""
        msisdn = normalize_bd_msisdn(to)
        csmsid = uuid.uuid4().hex
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                self.SMS_URL,
                data={
                    "api_token": creds["api_token"],
                    "sid": sender_id,
                    "msisdn": msisdn,
                    "sms": message,
                    "csmsid": csmsid,
                },
            )
            response.raise_for_status()
            data = response.json()
            # Status code 0 = submitted successfully in SSL Wireless API
            if data.get("status_code") != 0:
                raise RuntimeError(f"SSL Wireless error: {data}")
            messages = data.get("messages", [])
            return messages[0].get("csmsid", csmsid) if messages else csmsid

    async def send_whatsapp_with_creds(self, creds: dict, *, to: str, message: str) -> str:
        """Send through explicit WhatsApp credentials (the admin test box, before going live)."""
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(self.WA_URL, json={"api_token": creds["api_token"], "to": normalize_bd_msisdn(to), "message": message})
            response.raise_for_status()
            return response.json().get("message_id", f"wa-{uuid.uuid4().hex}")

    async def send_whatsapp(self, db: AsyncSession, *, to: str, message: str) -> str:
        """Send a WhatsApp message via SSL Wireless acting as Meta-approved BSP.

        Requires separate WhatsApp BSP approval from SSL Wireless (a
        different credential set from the SMS API token).
        """
        # The dedicated WhatsApp panel's credentials win; fall back to the SSL Wireless token.
        creds = await get_live_creds(db, "whatsapp_bsp") or await get_live_creds(db, "sslwireless")
        if creds is None:
            raise ValueError("WhatsApp sending isn't connected on this platform yet.")

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                self.WA_URL,
                json={
                    "api_token": creds["api_token"],
                    "to": normalize_bd_msisdn(to),
                    "message": message,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("message_id", f"wa-{uuid.uuid4().hex}")


sslwireless_client = SSLWirelessClient()
