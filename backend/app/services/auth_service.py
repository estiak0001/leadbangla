import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, hash_password, verify_password
from app.models.user import User


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class InvalidInviteTokenError(Exception):
    pass


async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    *,
    org_name: str,
    language: str,
    phone: str,
    industry: str,
    company_size: str,
    website: str | None = None,
    verified: bool = False,
) -> User:
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise EmailAlreadyRegisteredError(email)

    user = User(
        email=email,
        hashed_password=hash_password(password),
        is_verified=verified,
        pending_org_name=org_name,
        pending_language=language,
        pending_phone=phone,
        pending_industry=industry,
        pending_company_size=company_size,
        pending_website=website,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class EmailNotVerifiedError(Exception):
    pass


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active or not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError()
    if not user.is_verified:
        raise EmailNotVerifiedError()
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email))


async def change_password(db: AsyncSession, user: User, current: str, new: str) -> None:
    if not verify_password(current, user.hashed_password):
        raise InvalidCredentialsError()
    user.hashed_password = hash_password(new)
    user.must_change_password = False
    await db.commit()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def set_password(db: AsyncSession, user: User, new_password: str) -> None:
    """Sets a new password without checking the old one — used after OTP
    verification in the forgot-password flow, where the OTP is the proof."""
    user.hashed_password = hash_password(new_password)
    user.must_change_password = False
    await db.commit()


async def set_password_from_invite(db: AsyncSession, token: str, password: str) -> User:
    try:
        payload = decode_token(token)
        if payload.get("type") != "invite":
            raise InvalidInviteTokenError()
        user = await db.get(User, uuid.UUID(payload["sub"]))
    except Exception:
        raise InvalidInviteTokenError()
    if user is None:
        raise InvalidInviteTokenError()

    user.hashed_password = hash_password(password)
    user.must_change_password = False
    from app.models.organization import OrganizationMember  # noqa: PLC0415

    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == user.id))
    joined_org = None
    if member is not None:
        was_pending = member.invite_pending
        member.invite_pending = False
        joined_org = member.organization_id if was_pending else None
    await db.commit()
    await db.refresh(user)
    if joined_org is not None:
        from app.services import inbox  # noqa: PLC0415

        await inbox.notify(db, joined_org, await inbox.owners_and_admins(db, joined_org), category="team", kind="member_joined",
                           title=f"{user.email} accepted the invite and joined your team", link="/team", actor_id=user.id,
                           email_html=f"<p><strong>{user.email}</strong> accepted your invite and can now sign in.</p>")
    return user
