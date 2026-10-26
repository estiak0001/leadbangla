"""Platform-wide service switches. A disabled service is hidden from customers and cannot be used."""
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.platform_feature import PlatformFeature


async def feature_map(db: AsyncSession) -> dict[str, bool]:
    return {f.code: f.is_enabled for f in await db.scalars(select(PlatformFeature))}


async def is_on(db: AsyncSession, code: str) -> bool:
    f = await db.get(PlatformFeature, code)
    return True if f is None else f.is_enabled  # an unknown service is not blocked


def require_feature(code: str):
    """Router dependency: refuse every request while the service is switched off."""
    async def dep(db: AsyncSession = Depends(get_db)) -> None:
        if not await is_on(db, code):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="This service is not available right now.")
    return dep
