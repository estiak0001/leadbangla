import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
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
