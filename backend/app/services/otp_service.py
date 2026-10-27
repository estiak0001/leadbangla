"""Email OTP issuing/verification, used to confirm a signup's email address.

Delivery goes through the same EmailClient (Amazon SES, or SMTP locally) used
for every other transactional email on the platform — there is no separate
sending path for OTPs.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.email_client import email_client
from app.models.email_otp import EmailOtp
from app.models.user import User

OTP_TTL_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 45
MAX_ATTEMPTS = 5

# OTP purpose -> the admin-editable email template that purpose is sent with.
PURPOSE_TEMPLATE = {
    "signup_verify": "signup_otp",
    "password_reset": "password_reset_otp",
}


class OtpError(Exception):
    """Base for all OTP failures; `message` is safe to show the user."""

    message = "Invalid or expired code."

    def __init__(self) -> None:
        super().__init__(self.message)


class OtpCooldownError(OtpError):
    message = "Please wait a moment before requesting another code."


class OtpExpiredError(OtpError):
    message = "This code has expired. Request a new one."


class OtpIncorrectError(OtpError):
    message = "That code isn't correct."


class OtpTooManyAttemptsError(OtpError):
    message = "Too many incorrect attempts. Request a new code."


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def _latest(db: AsyncSession, user_id, purpose: str) -> EmailOtp | None:
    return await db.scalar(
        select(EmailOtp)
        .where(EmailOtp.user_id == user_id, EmailOtp.purpose == purpose)
        .order_by(EmailOtp.created_at.desc())
    )


async def issue_otp(db: AsyncSession, user: User, *, purpose: str = "signup_verify") -> None:
    """Creates a fresh code and emails it. Raises OtpCooldownError if one was
    just sent, or EmailSendError (from EmailClient) if delivery fails."""
    now = datetime.now(timezone.utc)
    last = await _latest(db, user.id, purpose)
    if last is not None and (now - last.created_at).total_seconds() < RESEND_COOLDOWN_SECONDS:
        raise OtpCooldownError()

    code = _generate_code()
    db.add(EmailOtp(
        user_id=user.id,
        purpose=purpose,
        code_hash=_hash(code),
        expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
    ))
    await db.commit()

    await email_client.send_template_email(
        db,
        key=PURPOSE_TEMPLATE[purpose],
        to_email=user.email,
        code=code,
        ttl_minutes=str(OTP_TTL_MINUTES),
    )


async def verify_otp(db: AsyncSession, user: User, code: str, *, purpose: str = "signup_verify") -> None:
    now = datetime.now(timezone.utc)
    otp = await db.scalar(
        select(EmailOtp)
        .where(EmailOtp.user_id == user.id, EmailOtp.purpose == purpose, EmailOtp.consumed_at.is_(None))
        .order_by(EmailOtp.created_at.desc())
    )
    if otp is None or otp.expires_at < now:
        raise OtpExpiredError()
    if otp.attempts >= MAX_ATTEMPTS:
        raise OtpTooManyAttemptsError()
    if otp.code_hash != _hash(code.strip()):
        otp.attempts += 1
        await db.commit()
        raise OtpIncorrectError()

    otp.consumed_at = now
    if purpose == "signup_verify":
        user.is_verified = True
        user.email_verified_at = now
    await db.commit()
