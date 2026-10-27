import asyncio
import base64

import httpx

from app.core.config import settings


async def _test_ses(creds: dict) -> tuple[bool, str]:
    from app.integrations.email_delivery import friendly_ses_error, ses_client

    region = (creds.get("region") or "us-east-1").strip()
    cfg = {
        "access_key_id": (creds.get("access_key_id") or "").strip(),
        "secret_access_key": (creds.get("secret_access_key") or "").strip(),
        "region": region,
    }
    if not cfg["access_key_id"] or not cfg["secret_access_key"]:
        return False, "Access Key ID and Secret Access Key are both required."
    try:
        account = await asyncio.to_thread(lambda: ses_client(cfg).get_account())
    except Exception as e:
        return False, friendly_ses_error(e, region=region)

    quota = account.get("SendQuota", {})
    sent24, max24 = int(quota.get("SentLast24Hours", 0)), int(quota.get("Max24HourSend", 0))
    if not account.get("SendingEnabled", True):
        return False, f"Connected to Amazon SES ({region}), but sending is DISABLED on this AWS account. Check the SES console for a pause notice."
    if not account.get("ProductionAccessEnabled"):
        return True, (
            f"Connected to Amazon SES ({region}) — but the account is in SANDBOX mode: you can only send to verified "
            f"addresses, max {max24:,} emails/24h ({sent24:,} used). Request production access in the SES console to email real customers."
        )
    return True, f"Connected to Amazon SES ({region}). Production access is on. Quota: {sent24:,} of {max24:,} emails in the last 24h, up to {quota.get('MaxSendRate', 0):g}/second."


async def test_service(code: str, creds: dict) -> tuple[bool, str]:
    try:
        if code == "amazon_ses":
            return await _test_ses(creds)
        if code == "sslwireless":
            # A request with a blank msisdn still returns a structured error,
            # which is enough to prove the API token itself is accepted.
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    "https://sms.sslwireless.com/pushapi/dynamic/server.php",
                    data={
                        "api_token": creds["api_token"],
                        "sid": settings.sslwireless_sender_id,
                        "msisdn": "test",
                        "sms": "ping",
                        "csmsid": "test-ping",
                    },
                )
            return r.status_code < 500, f"HTTP {r.status_code}"

        if code == "meta_whatsapp":
            from app.integrations import meta_whatsapp as mw  # noqa: PLC0415

            for k, label in (("access_token", "Access token"), ("phone_number_id", "Phone number ID")):
                if not creds.get(k):
                    return False, f"Enter the {label}."
            info = await mw.phone_info(creds)
            msg = f"Connected to Meta. Number {info.get('display_phone_number', '?')} ({info.get('verified_name', 'unnamed')}), quality {info.get('quality_rating', 'unknown')}."
            if creds.get("waba_id"):
                n = len(await mw.list_templates(creds))
                msg += f" {n} approved template(s) found."
            else:
                msg += " Add the WhatsApp Business Account ID to list templates."
            return True, msg

        if code == "whatsapp_bsp":
            if not creds.get("api_token"):
                return False, "Enter the BSP API token."
            return True, "Credentials are saved. Your BSP has no read-only check, so use 'Send a test WhatsApp message' to prove the connection."

        if code == "meta_social":
            # These are the platform's own OAuth app credentials (customers connect their own
            # Pages), not a page token — check them with a client_credentials grant.
            for k, label in (("client_id", "App ID"), ("client_secret", "App Secret")):
                if not creds.get(k):
                    return False, f"Enter the {label}."
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://graph.facebook.com/oauth/access_token",
                    params={"client_id": creds["client_id"], "client_secret": creds["client_secret"], "grant_type": "client_credentials"},
                )
            if r.status_code == 200 and "access_token" in r.json():
                return True, "App ID and App Secret are valid."
            try:
                msg = r.json().get("error", {}).get("message", f"HTTP {r.status_code}")
            except ValueError:
                msg = f"HTTP {r.status_code}"
            return False, f"Meta rejected these credentials: {msg}"

        if code == "linkedin":
            for k, label in (("client_id", "Client ID"), ("client_secret", "Client Secret")):
                if not creds.get(k):
                    return False, f"Enter the {label}."
            return True, "Credentials are saved. LinkedIn has no read-only check for a Client ID/Secret alone — the first customer Connect will confirm they work."

        if code == "dataseo":
            token = base64.b64encode(f"{creds['login']}:{creds['password']}".encode()).decode()
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.dataforseo.com/v3/appendix/user_data",
                    headers={"Authorization": f"Basic {token}"},
                )
            return r.status_code == 200, f"HTTP {r.status_code}"

        if code == "twitter_x":
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.twitter.com/2/users/me",
                    headers={"Authorization": f"Bearer {creds['bearer_token']}"},
                )
            return r.status_code == 200, f"HTTP {r.status_code}"

        if code == "firebase_vapid":
            # No live endpoint to hit for a bare VAPID keypair — just verify
            # the public key is valid base64url, which catches copy/paste errors.
            from cryptography.hazmat.primitives import serialization  # noqa: PLC0415

            pub = base64.urlsafe_b64decode(creds["vapid_public_key"] + "==")
            private = serialization.load_pem_private_key(creds["vapid_private_key"].encode(), password=None)
            derived = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
            if derived != pub:
                return False, "The public key doesn't belong to this private key. Generate a new pair, or paste both from the same pair."
            if not str(creds.get("vapid_subject", "")).startswith(("mailto:", "https://")):
                return False, "The contact address must start with mailto: (for example mailto:you@yourcompany.com)."
            return True, "Keys are valid and match. Push is ready once you switch it on."

        if code == "sslcommerz":
            # A real connectivity check needs a live checkout session, which
            # we don't want to spin up just to test credentials — presence
            # of a store_id is as far as this check goes.
            return bool(creds.get("store_id")), "Credentials present"

        return False, f"Unknown service: {code}"
    except Exception as e:
        return False, str(e)
