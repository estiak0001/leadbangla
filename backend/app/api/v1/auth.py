import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.schemas.auth import AcceptInviteRequest, LoginRequest, RefreshRequest, SignupRequest, TokenPair, UserRead
from app.services.auth_service import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidInviteTokenError,
    authenticate_user,
    create_user,
    get_user_by_id,
    set_password_from_invite,
    change_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user_id: uuid.UUID) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(str(user_id)),
        refresh_token=create_refresh_token(str(user_id)),
    )


@router.post("/signup", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        user = await create_user(
            db,
            payload.email,
            payload.password,
            org_name=payload.org_name,
            language=payload.language,
            phone=payload.phone,
            industry=payload.industry,
            company_size=payload.company_size,
            website=payload.website,
        )
    except EmailAlreadyRegisteredError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    return _issue_tokens(user.id)


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        user = await authenticate_user(db, payload.email, payload.password)
    except InvalidCredentialsError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    return _issue_tokens(user.id)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    invalid_token_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
    )
    try:
        token_payload = decode_token(payload.refresh_token)
        if token_payload.get("type") != "refresh":
            raise invalid_token_error
    except Exception:
        raise invalid_token_error

    user = await get_user_by_id(db, uuid.UUID(token_payload["sub"]))
    if user is None:
        raise invalid_token_error
    return _issue_tokens(user.id)


@router.post("/accept-invite", response_model=TokenPair)
async def accept_invite(payload: AcceptInviteRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        user = await set_password_from_invite(db, payload.token, payload.password)
    except InvalidInviteTokenError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invite link")
    return _issue_tokens(user.id)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password_route(payload: ChangePasswordRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> None:
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Choose a new password that is different from the current one")
    try:
        await change_password(db, current_user, payload.current_password, payload.new_password)
    except InvalidCredentialsError:
        raise HTTPException(status_code=400, detail="Your current password is not correct")


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
