import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.integrations.email_delivery import EmailSendError
from app.models.user import User
from app.schemas.auth import (
    AcceptInviteRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResendOtpRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    TokenPair,
    UserRead,
    VerifyOtpRequest,
)
from app.services.auth_service import (
    EmailAlreadyRegisteredError,
    EmailNotVerifiedError,
    InvalidCredentialsError,
    InvalidInviteTokenError,
    authenticate_user,
    create_user,
    get_user_by_email,
    get_user_by_id,
    set_password,
    set_password_from_invite,
    change_password,
)
from app.services.otp_service import (
    OtpCooldownError,
    OtpExpiredError,
    OtpIncorrectError,
    OtpTooManyAttemptsError,
    issue_otp,
    verify_otp,
)

EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user_id: uuid.UUID) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(str(user_id)),
        refresh_token=create_refresh_token(str(user_id)),
    )


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> SignupResponse:
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
            verified=not settings.email_verification_required,
        )
    except EmailAlreadyRegisteredError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if not settings.email_verification_required:
        tokens = _issue_tokens(user.id)
        return SignupResponse(verification_required=False, email=user.email, access_token=tokens.access_token, refresh_token=tokens.refresh_token)
    try:
        await issue_otp(db, user, purpose="signup_verify")
    except EmailSendError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Your account was created, but we couldn't send the verification email. Try resending the code.",
        )
    return SignupResponse(email=user.email)


@router.post("/verify-otp", response_model=TokenPair)
async def verify_otp_route(payload: VerifyOtpRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")
    user = await get_user_by_email(db, payload.email)
    if user is None:
        raise invalid
    try:
        await verify_otp(db, user, payload.code, purpose="signup_verify")
    except (OtpExpiredError, OtpIncorrectError, OtpTooManyAttemptsError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _issue_tokens(user.id)


@router.post("/resend-otp", status_code=status.HTTP_204_NO_CONTENT)
async def resend_otp_route(payload: ResendOtpRequest, db: AsyncSession = Depends(get_db)) -> None:
    user = await get_user_by_email(db, payload.email)
    if user is None or user.is_verified:
        # Don't reveal whether the email exists or is already verified.
        return
    try:
        await issue_otp(db, user, purpose="signup_verify")
    except OtpCooldownError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))
    except EmailSendError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="We couldn't send the verification email. Please try again.")


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password_route(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> None:
    user = await get_user_by_email(db, payload.email)
    if user is None:
        # Don't reveal whether the email exists.
        return
    try:
        await issue_otp(db, user, purpose="password_reset")
    except OtpCooldownError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))
    except EmailSendError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="We couldn't send the reset code. Please try again.")


@router.post("/reset-password", response_model=TokenPair)
async def reset_password_route(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")
    user = await get_user_by_email(db, payload.email)
    if user is None:
        raise invalid
    try:
        await verify_otp(db, user, payload.code, purpose="password_reset")
    except (OtpExpiredError, OtpIncorrectError, OtpTooManyAttemptsError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await set_password(db, user, payload.new_password)
    return _issue_tokens(user.id)


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        user = await authenticate_user(db, payload.email, payload.password)
    except EmailNotVerifiedError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=EMAIL_NOT_VERIFIED)
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
