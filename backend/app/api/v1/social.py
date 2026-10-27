import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import social_oauth
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_membership
from app.core.service_creds import get_live_creds
from app.integrations.meta import SocialPublishError
from app.models.enums import SocialPlatform
from app.models.organization import OrganizationMember
from app.schemas.social import SocialAccountCreate, SocialAccountRead, SocialPostCreate, SocialPostRead, SocialPostUpdate
from app.services.social_service import (
    PostNotPublishableError,
    SocialAccountNotFoundError,
    SocialInputError,
    SocialPostNotFoundError,
    check_account,
    connect_oauth_account,
    create_social_account,
    create_social_post,
    delete_social_account,
    delete_social_post,
    get_social_post,
    list_social_accounts,
    list_social_posts,
    queue_post,
    refresh_post_stats,
    update_social_post,
)
from app.workers.tasks import publish_social_post_task

router = APIRouter(prefix="/social", tags=["social"])

# Provider -> the platform_services code holding its OAuth app client id/secret.
# "meta" covers both Facebook and Instagram (one Meta app, one consent screen).
OAUTH_PROVIDERS = {"meta": "meta_social", "linkedin": "linkedin"}


def _post_to_read(post) -> SocialPostRead:
    return SocialPostRead(
        id=post.id,
        social_account_id=post.social_account_id,
        platform=post.platform.value,
        content=post.content,
        media_url=post.media_url,
        scheduled_at=post.scheduled_at,
        published_at=post.published_at,
        external_post_id=post.external_post_id,
        status=post.status.value,
        likes_count=post.likes_count,
        shares_count=post.shares_count,
        comments_count=post.comments_count,
        error_message=post.error_message,
        created_at=post.created_at,
    )


# ── Accounts ─────────────────────────────────────────────────────────────────


def _account_read(a) -> SocialAccountRead:
    return SocialAccountRead(
        id=a.id, platform=a.platform.value, account_name=a.account_name, page_id=a.page_id, is_active=a.is_active,
        has_token=bool(a.access_token), last_checked_at=a.last_checked_at, last_check_ok=a.last_check_ok,
        last_check_message=a.last_check_message, created_at=a.created_at,
    )


@router.get("/accounts", response_model=list[SocialAccountRead])
async def get_accounts(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SocialAccountRead]:
    return [_account_read(a) for a in await list_social_accounts(db, membership.organization_id)]


@router.post("/accounts", response_model=SocialAccountRead, status_code=status.HTTP_201_CREATED)
async def connect_account(
    payload: SocialAccountCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SocialAccountRead:
    try:
        platform = SocialPlatform(payload.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {payload.platform}")
    try:
        account = await create_social_account(
            db, membership.organization_id, platform=platform, account_name=payload.account_name,
            page_id=payload.page_id, access_token=payload.access_token,
        )
    except SocialInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _account_read(account)


@router.post("/accounts/{account_id}/check", response_model=SocialAccountRead)
async def check_connection(
    account_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SocialAccountRead:
    """Ask the network right now whether this account's token still works."""
    try:
        return _account_read(await check_account(db, membership.organization_id, account_id))
    except SocialAccountNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_account(
    account_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await delete_social_account(db, membership.organization_id, account_id)
    except SocialAccountNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")


# ── OAuth connect (Meta, LinkedIn) ──────────────────────────────────────────────


@router.get("/connect/{provider}/start")
async def start_oauth_connect(
    provider: str,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Called by the frontend (with the usual auth header) to get the URL to send the
    browser to. The actual redirect happens client-side, not here, since this endpoint
    needs the Authorization header that a plain browser navigation wouldn't carry."""
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    creds = await get_live_creds(db, OAUTH_PROVIDERS[provider])
    if not creds or not creds.get("client_id"):
        raise HTTPException(status_code=503, detail=f"{provider.title()} isn't set up yet. Ask an admin to add it in Integration Hub.")
    state = social_oauth.make_state(membership.organization_id, provider)
    if provider == "meta":
        url = social_oauth.meta_authorize_url(creds["client_id"], state)
    else:
        url = social_oauth.linkedin_authorize_url(creds["client_id"], state)
    return {"authorize_url": url}


@router.get("/connect/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Meta/LinkedIn redirect the browser here directly — no Authorization header, hence
    the signed `state` (see app/core/social_oauth.py) instead of the usual auth dependency."""
    def back(ok: bool, message: str) -> RedirectResponse:
        q = urlencode({"tab": "accounts", "connected": provider, "ok": "1" if ok else "0", "message": message})
        return RedirectResponse(f"{settings.app_base_url}/social?{q}")

    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    if error:
        return back(False, error_description or error)
    if not code or not state:
        return back(False, "The connection was cancelled or incomplete.")
    try:
        org_id = social_oauth.verify_state(state, provider)
    except social_oauth.OAuthError as e:
        return back(False, str(e))

    creds = await get_live_creds(db, OAUTH_PROVIDERS[provider])
    if not creds or not creds.get("client_id") or not creds.get("client_secret"):
        return back(False, f"{provider.title()} isn't configured on this server.")

    try:
        if provider == "meta":
            found = await social_oauth.meta_exchange(client_id=creds["client_id"], client_secret=creds["client_secret"], code=code)
        else:
            found = [await social_oauth.linkedin_exchange(client_id=creds["client_id"], client_secret=creds["client_secret"], code=code)]
    except social_oauth.OAuthError as e:
        return back(False, str(e))

    connected = 0
    for item in found:
        try:
            await connect_oauth_account(
                db, org_id, platform=SocialPlatform(item["platform"]), account_name=item["account_name"],
                page_id=item["page_id"], access_token=item["access_token"],
            )
            connected += 1
        except SocialInputError:
            continue  # e.g. plan limit reached partway through a multi-page Meta connect
    if not connected:
        return back(False, "No accounts could be connected (check your plan's account limit).")
    return back(True, f"Connected {connected} account{'s' if connected != 1 else ''}.")


# ── Posts ─────────────────────────────────────────────────────────────────────


@router.get("/posts", response_model=list[SocialPostRead])
async def get_posts(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SocialPostRead]:
    return [_post_to_read(p) for p in await list_social_posts(db, membership.organization_id)]


@router.post("/posts", response_model=SocialPostRead, status_code=status.HTTP_201_CREATED)
async def schedule_post(
    payload: SocialPostCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SocialPostRead:
    """Draft = saved only. Otherwise it is scheduled; a post with no future time goes out right away.
    Future posts are picked up by the once-a-minute publisher (not by long-delayed queue tasks)."""
    try:
        post = await create_social_post(
            db, membership.organization_id, social_account_id=payload.social_account_id, content=payload.content,
            media_url=payload.media_url, scheduled_at=payload.scheduled_at, draft=payload.draft,
        )
    except SocialAccountNotFoundError:
        raise HTTPException(status_code=404, detail="Social account not found")
    except SocialInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not payload.draft and post.scheduled_at is None:
        publish_social_post_task.delay(str(membership.organization_id), str(post.id))
    return _post_to_read(post)


@router.put("/posts/{post_id}", response_model=SocialPostRead)
async def edit_post(
    post_id: uuid.UUID,
    payload: SocialPostUpdate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SocialPostRead:
    try:
        post = await update_social_post(
            db, membership.organization_id, post_id, content=payload.content, media_url=payload.media_url,
            scheduled_at=payload.scheduled_at, clear_schedule=payload.clear_schedule, draft=payload.draft,
        )
    except SocialPostNotFoundError:
        raise HTTPException(status_code=404, detail="Post not found")
    except PostNotPublishableError:
        raise HTTPException(status_code=409, detail="A published post can't be edited here. Edit it on the network.")
    except SocialInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if post.status.value == "scheduled" and post.scheduled_at is None:
        publish_social_post_task.delay(str(membership.organization_id), str(post.id))
    return _post_to_read(post)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_post(
    post_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await delete_social_post(db, membership.organization_id, post_id)
    except SocialPostNotFoundError:
        raise HTTPException(status_code=404, detail="Post not found")


@router.post("/posts/{post_id}/publish-now", response_model=SocialPostRead)
async def publish_now(
    post_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SocialPostRead:
    """Publish a draft, scheduled or failed post immediately (also used for Retry)."""
    try:
        post = await queue_post(db, membership.organization_id, post_id)
    except SocialPostNotFoundError:
        raise HTTPException(status_code=404, detail="Post not found")
    except PostNotPublishableError:
        raise HTTPException(status_code=409, detail="This post is already published or being published.")
    publish_social_post_task.delay(str(membership.organization_id), str(post_id))
    return _post_to_read(post)


@router.post("/posts/{post_id}/refresh-stats", response_model=SocialPostRead)
async def refresh_stats(
    post_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SocialPostRead:
    try:
        post = await refresh_post_stats(db, membership.organization_id, post_id)
    except SocialPostNotFoundError:
        raise HTTPException(status_code=404, detail="Post not found")
    except PostNotPublishableError:
        raise HTTPException(status_code=409, detail="Post is not published yet")
    except SocialPublishError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return _post_to_read(post)
