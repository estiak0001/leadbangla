"""LinkedIn organisation posting (text only). Real calls only — a post is published or it fails clearly."""
from urllib.parse import quote

import httpx

from app.integrations.meta import SocialPublishError

API_URL = "https://api.linkedin.com/v2"


def org_urn(value: str) -> str:
    v = (value or "").strip()
    return v if v.startswith("urn:") else f"urn:li:organization:{v}"


async def _req(method: str, path: str, *, token: str, **kw) -> httpx.Response:
    if not token:
        raise SocialPublishError("This account has no access token. Reconnect it from the Accounts tab.")
    headers = {"Authorization": f"Bearer {token}", "X-Restli-Protocol-Version": "2.0.0", **kw.pop("headers", {})}
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.request(method, f"{API_URL}/{path}", headers=headers, **kw)
    except httpx.HTTPError as e:
        raise SocialPublishError(f"Could not reach LinkedIn: {e}") from e
    if r.status_code == 401:
        raise SocialPublishError("LinkedIn: the access token is invalid or has expired. Reconnect the account with a new token.")
    if r.status_code == 403:
        raise SocialPublishError("LinkedIn: the token doesn't have permission (needs w_organization_social, and the user must be an admin of the page).")
    if r.status_code == 429:
        raise SocialPublishError("LinkedIn rate limit reached. Try again later.")
    if r.status_code >= 400:
        msg = ""
        try:
            msg = r.json().get("message", "")
        except ValueError:
            pass
        raise SocialPublishError(f"LinkedIn: {msg or f'HTTP {r.status_code}'}")
    return r


async def check(org: str, token: str) -> tuple[bool, str]:
    """(verified, message). LinkedIn has no read-only check for posting-only tokens, so this may be 'unverified'."""
    try:
        r = await _req("GET", f"organizations/{org.strip().split(':')[-1]}", token=token)
        return True, f"Connected to LinkedIn page “{r.json().get('localizedName', org)}”."
    except SocialPublishError as e:
        if "permission" in str(e):
            return False, "The token was saved but LinkedIn can't confirm it with this permission. The first post will confirm it works."
        raise


async def publish(*, org: str, token: str, content: str) -> str:
    payload = {
        "author": org_urn(org), "lifecycleState": "PUBLISHED",
        "specificContent": {"com.linkedin.ugc.ShareContent": {"shareCommentary": {"text": content}, "shareMediaCategory": "NONE"}},
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    r = await _req("POST", "ugcPosts", token=token, json=payload, headers={"Content-Type": "application/json"})
    return r.headers.get("X-RestLi-Id") or r.json().get("id", "")


async def stats(post_urn: str, token: str) -> dict[str, int]:
    d = (await _req("GET", f"socialActions/{quote(post_urn, safe='')}", token=token)).json()
    return {"likes": d.get("likesSummary", {}).get("totalLikes", 0), "shares": 0,
            "comments": d.get("commentsSummary", {}).get("totalFirstLevelComments", 0)}
