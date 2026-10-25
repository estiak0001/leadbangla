from datetime import datetime, timezone
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.models.organization import OrganizationMember
from app.models.user import User
from app.services.auth_service import get_user_by_id
from app.services.onboarding_service import get_membership_for_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/login")

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
)


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise CREDENTIALS_ERROR
        user_id = payload.get("sub")
        if user_id is None:
            raise CREDENTIALS_ERROR
    except JWTError:
        raise CREDENTIALS_ERROR

    user = await get_user_by_id(db, uuid.UUID(user_id))
    if user is None:
        raise CREDENTIALS_ERROR
    return user


async def get_current_membership(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> OrganizationMember:
    """Every tenant-scoped endpoint from here on should depend on this,
    not just `get_current_user` — it's what makes `organization_id`
    scoping enforceable at the service layer rather than per-route."""
    membership = await get_membership_for_user(db, current_user.id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organization membership")
    if not membership.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your access to this company has been turned off. Please contact your company owner.",
        )
    now = datetime.now(timezone.utc)
    if membership.last_seen_at is None or (now - membership.last_seen_at).total_seconds() > 300:
        membership.last_seen_at = now
        await db.commit()
    org = membership.organization
    if org is not None and org.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is suspended." + (f" Reason: {org.suspended_reason}." if org.suspended_reason else "") + " Please contact support.",
        )
    return membership


async def get_current_internal_user(current_user: User = Depends(get_current_user)) -> User:
    """Gates the admin panel's API surface. internal_role is only ever set
    via the seed/admin tool (app/scripts/create_internal_user.py), never
    through public signup."""
    if current_user.internal_role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Internal staff access required")
    return current_user
