"""OAuth 'Connect' flow for social platforms.

The browser is redirected straight to Meta/LinkedIn and back, so the callback never
carries our own Authorization header. A short-lived signed `state` token (made at
/start, while the user is authenticated) carries the org id across that round trip and
doubles as CSRF protection.
"""
import logging
import re
import uuid
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from jose import JWTError

from app.core.config import settings
from app.core.security import _create_token, decode_token

log = logging.getLogger("social")

_SECRET_PARAMS = re.compile(r"(client_secret|access_token|fb_exchange_token|code)=[^&\s'\"]+")


def _redact(text: str) -> str:
    """httpx puts the whole request URL in its error text; never let secrets or codes into logs or user messages."""
    return _SECRET_PARAMS.sub(r"\1=***", text)


STATE_MINUTES = 10
_STATE_TYPE = "social_oauth_state"

META_GRAPH = "https://graph.facebook.com/v21.0"
META_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish"
LINKEDIN_SCOPES = "openid profile w_member_social"


class OAuthError(Exception):
    """A failure with a message safe to show the user."""


def callback_url(provider: str) -> str:
    return f"{settings.backend_public_url}/v1/social/connect/{provider}/callback"


def make_state(org_id: uuid.UUID, provider: str) -> str:
    return _create_token(str(org_id), timedelta(minutes=STATE_MINUTES), _STATE_TYPE, provider=provider)


def verify_state(state: str, provider: str) -> uuid.UUID:
    try:
        payload = decode_token(state)
    except JWTError as e:
        raise OAuthError("This connection link expired. Try connecting again.") from e
    if payload.get("type") != _STATE_TYPE or payload.get("provider") != provider:
        raise OAuthError("This connection link is invalid. Try connecting again.")
    return uuid.UUID(payload["sub"])


# ── Meta (Facebook + Instagram) ───────────────────────────────────────────────

def meta_authorize_url(client_id: str, state: str) -> str:
    params = {
        "client_id": client_id, "redirect_uri": callback_url("meta"), "state": state,
        "scope": META_SCOPES, "response_type": "code",
    }
    return f"https://www.facebook.com/v21.0/dialog/oauth?{urlencode(params)}"


async def meta_exchange(*, client_id: str, client_secret: str, code: str) -> list[dict]:
    """One OAuth round trip can cover several Pages (and the Instagram accounts linked to
    them), so this returns a list of {platform, account_name, page_id, access_token}."""
    async with httpx.AsyncClient(timeout=25) as client:
        try:
            short = await client.get(f"{META_GRAPH}/oauth/access_token", params={
                "client_id": client_id, "client_secret": client_secret,
                "redirect_uri": callback_url("meta"), "code": code,
            })
            short.raise_for_status()
            short_token = short.json()["access_token"]

            long = await client.get(f"{META_GRAPH}/oauth/access_token", params={
                "grant_type": "fb_exchange_token", "client_id": client_id,
                "client_secret": client_secret, "fb_exchange_token": short_token,
            })
            long.raise_for_status()
            user_token = long.json()["access_token"]

            pages = await client.get(f"{META_GRAPH}/me/accounts", params={
                "fields": "name,access_token", "access_token": user_token,
            })
            pages.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("meta oauth exchange failed: %s", _redact(str(e)))
            raise OAuthError("Facebook didn't accept the connection. Please try again, or contact support if it keeps failing.") from e

        accounts: list[dict] = []
        for page in pages.json().get("data", []):
            page_id, page_token, name = page["id"], page["access_token"], page.get("name", page["id"])
            accounts.append({"platform": "facebook", "account_name": name, "page_id": page_id, "access_token": page_token})
            try:
                ig = await client.get(f"{META_GRAPH}/{page_id}", params={
                    "fields": "instagram_business_account{username}", "access_token": page_token,
                })
                ig_account = ig.json().get("instagram_business_account")
            except httpx.HTTPError:
                ig_account = None
            if ig_account:
                accounts.append({
                    "platform": "instagram", "account_name": f"@{ig_account.get('username', ig_account['id'])}",
                    "page_id": ig_account["id"], "access_token": page_token,
                })

    if not accounts:
        raise OAuthError(
            "No Facebook Pages were returned. Make sure you're an admin of at least one "
            "Page and granted access to it during login."
        )
    return accounts


# ── LinkedIn ───────────────────────────────────────────────────────────────────

def linkedin_authorize_url(client_id: str, state: str) -> str:
    params = {
        "response_type": "code", "client_id": client_id, "redirect_uri": callback_url("linkedin"),
        "state": state, "scope": LINKEDIN_SCOPES,
    }
    return f"https://www.linkedin.com/oauth/v2/authorization?{urlencode(params)}"


async def linkedin_exchange(*, client_id: str, client_secret: str, code: str) -> dict:
    """LinkedIn's 'Share on LinkedIn' product only covers the member's own profile
    (w_member_social) — posting as an organisation page needs the separate Marketing
    Developer Platform approval, which isn't wired up here yet."""
    async with httpx.AsyncClient(timeout=25) as client:
        try:
            tok = await client.post(
                "https://www.linkedin.com/oauth/v2/accessToken",
                data={
                    "grant_type": "authorization_code", "code": code, "redirect_uri": callback_url("linkedin"),
                    "client_id": client_id, "client_secret": client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            tok.raise_for_status()
            access_token = tok.json()["access_token"]

            me = await client.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            me.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("linkedin oauth exchange failed: %s", _redact(str(e)))
            raise OAuthError("LinkedIn didn't accept the connection. Please try again, or contact support if it keeps failing.") from e

    profile = me.json()
    return {
        "platform": "linkedin", "account_name": profile.get("name", "LinkedIn"),
        "page_id": f"urn:li:person:{profile['sub']}", "access_token": access_token,
    }
