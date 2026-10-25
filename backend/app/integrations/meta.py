"""Facebook Page and Instagram publishing through the Meta Graph API. Real calls only: a post is
either really published or it fails with a message a person can act on."""
import asyncio

import httpx

GRAPH_URL = "https://graph.facebook.com/v21.0"

ERRORS = {
    190: "The access token is invalid or has expired. Create a new long-lived Page token and reconnect the account.",
    102: "The access token has expired. Reconnect the account with a new token.",
    10: "The token doesn't have permission to post (needs pages_manage_posts and pages_read_engagement).",
    200: "The token doesn't have permission to post on this Page (needs pages_manage_posts).",
    283: "The token is missing a required permission for this action.",
    100: "Meta rejected something in the request (check the Page / Instagram ID and the image link).",
    368: "Meta temporarily blocked posting from this account for policy reasons.",
    4: "Meta rate limit reached. Try again in a little while.",
    17: "Meta rate limit reached. Try again in a little while.",
    32: "Meta rate limit reached. Try again in a little while.",
    9004: "Meta couldn't download the image from that link. Use a public https image URL (JPEG/PNG).",
    36003: "The Instagram account ID is wrong, or the account isn't a Business/Creator account linked to your Page.",
    2207026: "Instagram doesn't accept that image format. Use a public JPEG.",
}


class SocialPublishError(Exception):
    """A failure with a user-readable message."""


def _fail(resp: httpx.Response) -> SocialPublishError:
    try:
        err = resp.json().get("error", {})
    except ValueError:
        err = {}
    code, sub = err.get("code"), err.get("error_subcode")
    text = ERRORS.get(sub) or ERRORS.get(code) or err.get("error_user_msg") or err.get("message") or f"HTTP {resp.status_code}"
    return SocialPublishError(f"Meta: {text}")


async def _req(method: str, path: str, *, token: str, **kw) -> dict:
    if not token:
        raise SocialPublishError("This account has no access token. Reconnect it from the Accounts tab.")
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            if method == "GET":
                r = await client.get(f"{GRAPH_URL}/{path}", params={**kw.get("params", {}), "access_token": token})
            else:
                r = await client.post(f"{GRAPH_URL}/{path}", data={**kw.get("data", {}), "access_token": token})
    except httpx.HTTPError as e:
        raise SocialPublishError(f"Could not reach Meta: {e}") from e
    if r.status_code >= 400:
        raise _fail(r)
    return r.json()


async def check_facebook(page_id: str, token: str) -> str:
    d = await _req("GET", page_id, token=token, params={"fields": "name"})
    return f"Connected to Facebook Page “{d.get('name', page_id)}”."


async def check_instagram(ig_id: str, token: str) -> str:
    d = await _req("GET", ig_id, token=token, params={"fields": "username"})
    return f"Connected to Instagram @{d.get('username', ig_id)}."


async def publish_facebook(*, page_id: str, token: str, content: str, media_url: str | None) -> str:
    if media_url:
        d = await _req("POST", f"{page_id}/photos", token=token, data={"url": media_url, "caption": content})
        return d.get("post_id") or d["id"]
    d = await _req("POST", f"{page_id}/feed", token=token, data={"message": content})
    return d["id"]


async def publish_instagram(*, ig_id: str, token: str, content: str, media_url: str | None) -> str:
    if not media_url:
        raise SocialPublishError("Instagram posts need a picture. Add a public image link.")
    container = (await _req("POST", f"{ig_id}/media", token=token, data={"image_url": media_url, "caption": content}))["id"]
    for _ in range(10):            # Instagram prepares the image first; wait until it is ready
        st = (await _req("GET", container, token=token, params={"fields": "status_code"})).get("status_code")
        if st == "FINISHED":
            break
        if st == "ERROR":
            raise SocialPublishError("Instagram couldn't process that image. Use a public JPEG, at least 320px wide.")
        await asyncio.sleep(2)
    return (await _req("POST", f"{ig_id}/media_publish", token=token, data={"creation_id": container}))["id"]


async def stats_facebook(post_id: str, token: str) -> dict[str, int]:
    d = await _req("GET", post_id, token=token, params={"fields": "likes.summary(true),shares,comments.summary(true)"})
    return {"likes": d.get("likes", {}).get("summary", {}).get("total_count", 0), "shares": d.get("shares", {}).get("count", 0),
            "comments": d.get("comments", {}).get("summary", {}).get("total_count", 0)}


async def stats_instagram(media_id: str, token: str) -> dict[str, int]:
    d = await _req("GET", media_id, token=token, params={"fields": "like_count,comments_count"})
    return {"likes": d.get("like_count", 0), "shares": 0, "comments": d.get("comments_count", 0)}
