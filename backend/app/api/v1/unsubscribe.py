"""Public unsubscribe pages (no login). Linked from every campaign email and from the List-Unsubscribe header."""
from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services import unsubscribe_service as us

router = APIRouter(prefix="/public/unsubscribe", tags=["public-unsubscribe"])
_NO_STORE = {"Cache-Control": "no-store"}


@router.get("/{token}", response_class=HTMLResponse)
async def confirm_page(token: str, db: AsyncSession = Depends(get_db)) -> HTMLResponse:
    """Only shows a button. Opening the link must not unsubscribe by itself (mail scanners open links)."""
    info = await us.preview(db, token)
    if info is None:
        return HTMLResponse(us.page_invalid(), status_code=404, headers=_NO_STORE)
    return HTMLResponse(us.page_confirm(info["business"], info["email"]), headers=_NO_STORE)


@router.post("/{token}", response_class=HTMLResponse)
async def unsubscribe(token: str, db: AsyncSession = Depends(get_db)) -> HTMLResponse:
    """The button on the page, and the mail app's own one-click Unsubscribe."""
    info = await us.unsubscribe(db, token)
    if info is None:
        return HTMLResponse(us.page_invalid(), status_code=404, headers=_NO_STORE)
    return HTMLResponse(us.page_done(info["business"], info["email"]), headers=_NO_STORE)
