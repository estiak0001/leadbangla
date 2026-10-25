from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.platform_service import PlatformService
from app.schemas.platform_service import PlatformStatusItem

router = APIRouter(prefix="/platform", tags=["platform"])


@router.get("/status", response_model=list[PlatformStatusItem])
async def platform_status(db: AsyncSession = Depends(get_db)) -> list[PlatformStatusItem]:
    """Public, read-only service status — no credentials, no auth required.
    Lets the main app show tenants what's live vs. sandboxed vs. disabled
    without exposing the admin Integration Hub.

    Includes disabled services too (unlike a naive is_enabled-only filter)
    so a tenant can see "not available yet" rather than the service just
    silently disappearing from the list.
    """
    svcs = await db.scalars(select(PlatformService).order_by(PlatformService.category))
    items = []
    for s in svcs:
        is_live = s.is_enabled and s.is_live and s.credentials_enc is not None
        if is_live:
            status, note = "live", None
        elif s.is_enabled:
            status, note = "sandbox", ("Not connected — emails cannot be sent" if s.category == "email" else "Sandbox mode — sends are simulated")
        else:
            status, note = "disabled", "Contact support to activate"
        items.append(PlatformStatusItem(category=s.category, name=s.name, status=status, note=note))
    return items
