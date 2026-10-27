import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.onboarding import COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    org_name: str = Field(min_length=2, max_length=200)
    language: Literal["bn", "en"] = "en"
    phone: str = Field(min_length=6, max_length=30)
    industry: INDUSTRY_OPTIONS
    company_size: COMPANY_SIZE_OPTIONS
    website: str | None = Field(default=None, max_length=255)


class SignupResponse(BaseModel):
    verification_required: bool = True
    email: EmailStr
    # Only set when verification is switched off: the person is signed in straight away.
    access_token: str | None = None
    refresh_token: str | None = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendOtpRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    is_active: bool
    is_verified: bool = True
    must_change_password: bool = False
