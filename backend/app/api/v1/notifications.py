import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.services import inbox

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationRead(BaseModel):
    id: uuid.UUID
    category: str
    kind: str
    title: str
    body: str
    link: str | None
    read: bool
    created_at: datetime


class MarkRead(BaseModel):
    ids: list[uuid.UUID] | None = None   # omit = everything


@router.get("", response_model=list[NotificationRead])
async def list_notifications(unread_only: bool = False, limit: int = Query(default=30, ge=1, le=100), offset: int = Query(default=0, ge=0),
                             m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    rows = await inbox.list_for_user(db, m.user_id, unread_only=unread_only, limit=limit, offset=offset)
    return [NotificationRead(id=n.id, category=n.category, kind=n.kind, title=n.title, body=n.body, link=n.link,
                             read=n.read_at is not None, created_at=n.created_at) for n in rows]


@router.get("/unread-count")
async def unread_count(m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return {"count": await inbox.unread_count(db, m.user_id)}


@router.post("/read", status_code=204)
async def mark_read(body: MarkRead, m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await inbox.mark_read(db, m.user_id, body.ids)


@router.get("/preferences")
async def get_preferences(m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    prefs = await inbox.get_prefs(db, m.user_id)
    return [{"key": k, "label": v[0], "description": v[1], **prefs[k]} for k, v in inbox.CATEGORIES.items()]


class PrefPatch(BaseModel):
    prefs: dict[str, dict[str, bool]]


@router.put("/preferences")
async def put_preferences(body: PrefPatch, m=Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    prefs = await inbox.save_prefs(db, m.user_id, body.prefs)
    return [{"key": k, "label": v[0], "description": v[1], **prefs[k]} for k, v in inbox.CATEGORIES.items()]
