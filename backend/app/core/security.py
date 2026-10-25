from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def _create_token(subject: str, expires_delta: timedelta, token_type: str, **extra_claims: str) -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": subject, "exp": expire, "type": token_type, **extra_claims}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), "access")


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), "refresh")


def create_impersonation_token(user_id: str, impersonator_id: str) -> str:
    """Short-lived access token for support impersonation. No refresh token
    is issued for these — the session should simply expire, not be
    silently extended. The impersonator_id claim is there for future audit
    logging (plan.md's audit-logging requirement isn't built yet)."""
    return _create_token(
        user_id,
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
        impersonator_id=impersonator_id,
    )


def create_invite_token(user_id: str) -> str:
    """Sent in admin-onboarding invite emails so a newly created owner can set
    their own password (app/services/admin_service.py's admin_create_tenant)."""
    return _create_token(user_id, timedelta(days=7), "invite")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
