"""LeadBangla's own company profile — one row, edited in the admin panel.
Everything that needs the platform's identity (email branding today) reads
from here instead of keeping its own copy of the name/logo/address."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.models.company_settings import PlatformCompanySettings

MAX_LOGO_BYTES = 2 * 1024 * 1024
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/svg+xml", "image/webp"}

MAX_FAVICON_BYTES = 512 * 1024
ALLOWED_FAVICON_TYPES = {"image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml"}


class LogoTooLargeError(Exception):
    pass


class UnsupportedLogoTypeError(Exception):
    pass


class FaviconTooLargeError(Exception):
    pass


class UnsupportedFaviconTypeError(Exception):
    pass


async def get_settings(db: AsyncSession) -> PlatformCompanySettings:
    row = await db.scalar(select(PlatformCompanySettings).limit(1))
    if row is None:
        row = PlatformCompanySettings()
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def get_settings_with_logo(db: AsyncSession) -> PlatformCompanySettings:
    """Only the logo-serving/download route needs the (potentially large) logo bytes."""
    row = await db.scalar(select(PlatformCompanySettings).options(undefer(PlatformCompanySettings.logo_data)).limit(1))
    if row is None:
        row = await get_settings(db)
    return row


async def get_settings_with_favicon(db: AsyncSession) -> PlatformCompanySettings:
    row = await db.scalar(select(PlatformCompanySettings).options(undefer(PlatformCompanySettings.favicon_data)).limit(1))
    if row is None:
        row = await get_settings(db)
    return row


async def get_settings_with_logo_white(db: AsyncSession) -> PlatformCompanySettings:
    row = await db.scalar(select(PlatformCompanySettings).options(undefer(PlatformCompanySettings.logo_white_data)).limit(1))
    if row is None:
        row = await get_settings(db)
    return row


async def update_settings(
    db: AsyncSession,
    *,
    company_name: str | None = None,
    legal_name: str | None = ...,
    address: str | None = ...,
    city: str | None = ...,
    country: str | None = ...,
    phone: str | None = ...,
    support_email: str | None = ...,
    website: str | None = ...,
    updated_by: str | None = None,
) -> PlatformCompanySettings:
    row = await get_settings(db)
    if company_name is not None:
        row.company_name = company_name
    for field, value in (
        ("legal_name", legal_name), ("address", address), ("city", city), ("country", country),
        ("phone", phone), ("support_email", support_email), ("website", website),
    ):
        if value is not ...:
            setattr(row, field, value)
    if updated_by is not None:
        row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row


async def set_logo(db: AsyncSession, data: bytes, content_type: str, updated_by: str | None) -> PlatformCompanySettings:
    if content_type not in ALLOWED_LOGO_TYPES:
        raise UnsupportedLogoTypeError(content_type)
    if len(data) > MAX_LOGO_BYTES:
        raise LogoTooLargeError()
    row = await get_settings(db)
    row.logo_data = data
    row.logo_content_type = content_type
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row


async def clear_logo(db: AsyncSession, updated_by: str | None) -> PlatformCompanySettings:
    row = await get_settings(db)
    row.logo_data = None
    row.logo_content_type = None
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row


async def set_logo_white(db: AsyncSession, data: bytes, content_type: str, updated_by: str | None) -> PlatformCompanySettings:
    if content_type not in ALLOWED_LOGO_TYPES:
        raise UnsupportedLogoTypeError(content_type)
    if len(data) > MAX_LOGO_BYTES:
        raise LogoTooLargeError()
    row = await get_settings(db)
    row.logo_white_data = data
    row.logo_white_content_type = content_type
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row


async def clear_logo_white(db: AsyncSession, updated_by: str | None) -> PlatformCompanySettings:
    row = await get_settings(db)
    row.logo_white_data = None
    row.logo_white_content_type = None
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row


async def set_favicon(db: AsyncSession, data: bytes, content_type: str, updated_by: str | None) -> PlatformCompanySettings:
    if content_type not in ALLOWED_FAVICON_TYPES:
        raise UnsupportedFaviconTypeError(content_type)
    if len(data) > MAX_FAVICON_BYTES:
        raise FaviconTooLargeError()
    row = await get_settings(db)
    row.favicon_data = data
    row.favicon_content_type = content_type
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row


async def clear_favicon(db: AsyncSession, updated_by: str | None) -> PlatformCompanySettings:
    row = await get_settings(db)
    row.favicon_data = None
    row.favicon_content_type = None
    row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row
