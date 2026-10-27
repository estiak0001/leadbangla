import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cred_crypto import decrypt_creds, encrypt_creds
from app.integrations import linkedin as li
from app.integrations import meta
from app.integrations.meta import SocialPublishError
from app.models.enums import SocialPlatform, SocialPostStatus
from app.models.social import SocialAccount, SocialPost
from app.services.plan_service import ensure_within_limit

# Characters each network accepts (Facebook allows far more; we cap at the API limit of this app).
CONTENT_LIMITS = {SocialPlatform.FACEBOOK: 2000, SocialPlatform.INSTAGRAM: 2200, SocialPlatform.LINKEDIN: 3000}
TOKEN_PREFIX = "enc1:"


class SocialAccountNotFoundError(Exception):
    pass


class SocialPostNotFoundError(Exception):
    pass


class PostNotPublishableError(Exception):
    pass


class SocialInputError(Exception):
    """Bad input; the message is shown to the user."""


# ── Tokens (encrypted at rest; older plain values still readable) ─────────────

def seal_token(token: str) -> str:
    return TOKEN_PREFIX + encrypt_creds({"t": token.strip()}) if token.strip() else ""


def open_token(stored: str) -> str:
    if stored.startswith(TOKEN_PREFIX):
        return decrypt_creds(stored[len(TOKEN_PREFIX):]).get("t", "")
    return stored or ""


# ── Social accounts ──────────────────────────────────────────────────────────

async def _verify(account: SocialAccount) -> tuple[bool, str]:
    try:
        token = open_token(account.access_token)
    except Exception:
        return False, "Saved token could not be read. Reconnect this account with a new token."
    if not token:
        return False, "No access token saved. Reconnect this account with a token."
    try:
        if account.platform == SocialPlatform.FACEBOOK:
            return True, await meta.check_facebook(account.page_id, token)
        if account.platform == SocialPlatform.INSTAGRAM:
            return True, await meta.check_instagram(account.page_id, token)
        return await li.check(account.page_id, token)
    except SocialPublishError as e:
        return False, str(e)
    except Exception:
        return False, "Could not verify this account right now. Try again later."


async def check_account(db: AsyncSession, org_id: uuid.UUID, account_id: uuid.UUID) -> SocialAccount:
    account = await _get_account(db, org_id, account_id)
    ok, msg = await _verify(account)
    account.last_checked_at, account.last_check_ok, account.last_check_message = datetime.now(timezone.utc), ok, msg
    await db.commit()
    await db.refresh(account)
    return account


async def _get_account(db: AsyncSession, org_id: uuid.UUID, account_id: uuid.UUID) -> SocialAccount:
    account = await db.scalar(select(SocialAccount).where(SocialAccount.organization_id == org_id, SocialAccount.id == account_id))
    if account is None:
        raise SocialAccountNotFoundError(account_id)
    return account


async def create_social_account(
    db: AsyncSession, org_id: uuid.UUID, *, platform: SocialPlatform, account_name: str, page_id: str = "", access_token: str = "",
) -> SocialAccount:
    page_id, access_token = page_id.strip(), access_token.strip()
    if not page_id:
        raise SocialInputError({
            SocialPlatform.FACEBOOK: "Enter the Facebook Page ID.",
            SocialPlatform.INSTAGRAM: "Enter the Instagram Business account ID.",
            SocialPlatform.LINKEDIN: "Enter the LinkedIn organisation ID.",
        }[platform])
    if not access_token:
        raise SocialInputError("Paste the access token for this account.")
    current = await db.scalar(select(func.count(SocialAccount.id)).where(SocialAccount.organization_id == org_id, SocialAccount.is_active.is_(True)))
    await ensure_within_limit(db, org_id, "social_accounts_limit", "social_accounts", current or 0)
    account = SocialAccount(organization_id=org_id, platform=platform, account_name=account_name.strip(), page_id=page_id,
                            access_token=seal_token(access_token))
    ok, msg = await _verify(account)
    if not ok and "can't confirm" not in msg:
        # A token Meta/LinkedIn rejects is refused outright, so nobody saves a connection that can never work.
        raise SocialInputError(msg)
    account.last_checked_at, account.last_check_ok, account.last_check_message = datetime.now(timezone.utc), ok, msg
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


async def connect_oauth_account(
    db: AsyncSession, org_id: uuid.UUID, *, platform: SocialPlatform, account_name: str, page_id: str, access_token: str,
) -> SocialAccount:
    """Used by the OAuth callback. Reconnecting the same page/profile refreshes its token
    instead of hitting the plan limit a second time for an account that already counts."""
    existing = await db.scalar(select(SocialAccount).where(
        SocialAccount.organization_id == org_id, SocialAccount.platform == platform,
        SocialAccount.page_id == page_id, SocialAccount.is_active.is_(True),
    ))
    if existing is None:
        return await create_social_account(db, org_id, platform=platform, account_name=account_name, page_id=page_id, access_token=access_token)
    existing.access_token, existing.account_name = seal_token(access_token), account_name.strip() or existing.account_name
    ok, msg = await _verify(existing)
    existing.last_checked_at, existing.last_check_ok, existing.last_check_message = datetime.now(timezone.utc), ok, msg
    await db.commit()
    await db.refresh(existing)
    return existing


async def list_social_accounts(db: AsyncSession, org_id: uuid.UUID) -> list[SocialAccount]:
    result = await db.scalars(
        select(SocialAccount).where(SocialAccount.organization_id == org_id, SocialAccount.is_active.is_(True)).order_by(SocialAccount.created_at)
    )
    return list(result)


async def delete_social_account(db: AsyncSession, org_id: uuid.UUID, account_id: uuid.UUID) -> None:
    account = await _get_account(db, org_id, account_id)
    account.is_active = False
    account.access_token = ""       # the token is wiped on disconnect
    await db.commit()


# ── Social posts ─────────────────────────────────────────────────────────────

def _validate(platform: SocialPlatform, content: str, media_url: str | None) -> None:
    limit = CONTENT_LIMITS[platform]
    if len(content) > limit:
        raise SocialInputError(f"{platform.value.title()} posts can be at most {limit:,} characters (this one has {len(content):,}).")
    if platform == SocialPlatform.INSTAGRAM and not media_url:
        raise SocialInputError("Instagram posts need a picture. Add a public image link.")
    if platform == SocialPlatform.LINKEDIN and media_url:
        raise SocialInputError("LinkedIn posts are text-only for now. Remove the image link or post this one to Facebook/Instagram.")
    if media_url and not media_url.lower().startswith(("http://", "https://")):
        raise SocialInputError("The image link must start with https://")


async def create_social_post(
    db: AsyncSession, org_id: uuid.UUID, *, social_account_id: uuid.UUID, content: str,
    media_url: str | None = None, scheduled_at: datetime | None = None, draft: bool = False,
) -> SocialPost:
    account = await _get_account(db, org_id, social_account_id)
    if not account.is_active:
        raise SocialInputError("This account was disconnected. Reconnect it first.")
    media_url = (media_url or "").strip() or None
    _validate(account.platform, content, media_url)
    now = datetime.now(timezone.utc)
    if scheduled_at and scheduled_at <= now:
        scheduled_at = None
    post = SocialPost(
        organization_id=org_id, social_account_id=social_account_id, platform=account.platform, content=content,
        media_url=media_url, scheduled_at=None if draft else scheduled_at,
        status=SocialPostStatus.DRAFT if draft else SocialPostStatus.SCHEDULED,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


async def update_social_post(
    db: AsyncSession, org_id: uuid.UUID, post_id: uuid.UUID, *, content: str | None, media_url: str | None,
    scheduled_at: datetime | None, clear_schedule: bool, draft: bool | None,
) -> SocialPost:
    post = await get_social_post(db, org_id, post_id)
    if post.status in (SocialPostStatus.PUBLISHED, SocialPostStatus.PUBLISHING):
        raise PostNotPublishableError(post_id)
    if content is not None:
        post.content = content
    if media_url is not None:
        post.media_url = media_url.strip() or None
    _validate(post.platform, post.content, post.media_url)
    now = datetime.now(timezone.utc)
    if clear_schedule:
        post.scheduled_at = None
    elif scheduled_at is not None:
        post.scheduled_at = scheduled_at if scheduled_at > now else None
    if draft is True:
        post.status, post.scheduled_at = SocialPostStatus.DRAFT, None
    elif draft is False or post.status == SocialPostStatus.FAILED:
        post.status = SocialPostStatus.SCHEDULED
    post.error_message = None
    await db.commit()
    await db.refresh(post)
    return post


async def list_social_posts(db: AsyncSession, org_id: uuid.UUID) -> list[SocialPost]:
    result = await db.scalars(select(SocialPost).where(SocialPost.organization_id == org_id).order_by(SocialPost.created_at.desc()))
    return list(result)


async def get_social_post(db: AsyncSession, org_id: uuid.UUID, post_id: uuid.UUID) -> SocialPost:
    post = await db.scalar(select(SocialPost).where(SocialPost.organization_id == org_id, SocialPost.id == post_id))
    if post is None:
        raise SocialPostNotFoundError(post_id)
    return post


async def delete_social_post(db: AsyncSession, org_id: uuid.UUID, post_id: uuid.UUID) -> None:
    post = await get_social_post(db, org_id, post_id)
    await db.delete(post)
    await db.commit()


async def queue_post(db: AsyncSession, org_id: uuid.UUID, post_id: uuid.UUID) -> SocialPost:
    """Make a draft/failed post due right now (the publisher picks it up within a minute, or at once via publish_post)."""
    post = await get_social_post(db, org_id, post_id)
    if post.status not in (SocialPostStatus.DRAFT, SocialPostStatus.SCHEDULED, SocialPostStatus.FAILED):
        raise PostNotPublishableError(post_id)
    post.status, post.scheduled_at, post.error_message = SocialPostStatus.SCHEDULED, None, None
    await db.commit()
    await db.refresh(post)
    return post


async def publish_post(db: AsyncSession, org_id: uuid.UUID, post_id: uuid.UUID) -> SocialPost:
    """Does the real API call (Celery only). On failure the reason is kept on the post."""
    post = await get_social_post(db, org_id, post_id)
    if post.status != SocialPostStatus.SCHEDULED:
        raise PostNotPublishableError(post_id)

    post.status, post.error_message = SocialPostStatus.PUBLISHING, None
    await db.commit()

    account = await db.scalar(select(SocialAccount).where(SocialAccount.id == post.social_account_id))
    try:
        if account is None or not account.is_active:
            raise SocialPublishError("The social account for this post was disconnected.")
        token = open_token(account.access_token)
        if post.platform == SocialPlatform.FACEBOOK:
            external = await meta.publish_facebook(page_id=account.page_id, token=token, content=post.content, media_url=post.media_url)
        elif post.platform == SocialPlatform.INSTAGRAM:
            external = await meta.publish_instagram(ig_id=account.page_id, token=token, content=post.content, media_url=post.media_url)
        else:
            external = await li.publish(org=account.page_id, token=token, content=post.content)
        post.external_post_id, post.status, post.published_at = external, SocialPostStatus.PUBLISHED, datetime.now(timezone.utc)
        try:                       # stats are a bonus; a stats hiccup must not undo a successful publish
            s = await _fetch_stats(post, account)
            post.likes_count, post.shares_count, post.comments_count = s["likes"], s["shares"], s["comments"]
        except SocialPublishError:
            pass
    except SocialPublishError as e:
        post.status, post.error_message = SocialPostStatus.FAILED, str(e)[:500]
    except Exception as e:  # noqa: BLE001 — never leave a post stuck in "publishing"
        post.status, post.error_message = SocialPostStatus.FAILED, f"Unexpected error: {e}"[:500]
    await db.commit()
    await db.refresh(post)
    return post


async def due_post_ids(db: AsyncSession) -> list[tuple[uuid.UUID, uuid.UUID]]:
    """(org_id, post_id) of scheduled posts whose time has come."""
    now = datetime.now(timezone.utc)
    rows = await db.execute(
        select(SocialPost.organization_id, SocialPost.id).where(
            SocialPost.status == SocialPostStatus.SCHEDULED, (SocialPost.scheduled_at.is_(None)) | (SocialPost.scheduled_at <= now)
        ).limit(100)
    )
    return [(o, p) for o, p in rows.all()]


async def recover_stuck(db: AsyncSession) -> int:
    """Posts left in 'publishing' for over 10 minutes (worker died) go back to failed so they can be retried."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    stuck = (await db.scalars(select(SocialPost).where(SocialPost.status == SocialPostStatus.PUBLISHING, SocialPost.created_at < cutoff))).all()
    for p in stuck:
        p.status, p.error_message = SocialPostStatus.FAILED, "Publishing was interrupted. Press Retry."
    await db.commit()
    return len(stuck)


async def refresh_post_stats(db: AsyncSession, org_id: uuid.UUID, post_id: uuid.UUID) -> SocialPost:
    post = await get_social_post(db, org_id, post_id)
    if post.status != SocialPostStatus.PUBLISHED:
        raise PostNotPublishableError(post_id)
    account = await db.scalar(select(SocialAccount).where(SocialAccount.id == post.social_account_id))
    if not post.external_post_id or post.external_post_id.startswith("fake-"):
        raise SocialPublishError("This is an old demo post, so there are no real numbers to fetch.")
    s = await _fetch_stats(post, account)
    post.likes_count, post.shares_count, post.comments_count = s["likes"], s["shares"], s["comments"]
    await db.commit()
    await db.refresh(post)
    return post


async def _fetch_stats(post: SocialPost, account: SocialAccount) -> dict[str, int]:
    token = open_token(account.access_token)
    if post.platform == SocialPlatform.FACEBOOK:
        return await meta.stats_facebook(post.external_post_id or "", token)
    if post.platform == SocialPlatform.INSTAGRAM:
        return await meta.stats_instagram(post.external_post_id or "", token)
    return await li.stats(post.external_post_id or "", token)
