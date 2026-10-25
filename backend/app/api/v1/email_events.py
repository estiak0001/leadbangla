"""Public endpoints: open pixel, click redirect, and the provider event webhook."""
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.enums import EventType
from app.services import email_event_service as svc
from app.services.email_tracking import decode_token

router = APIRouter(prefix="/public/email", tags=["public-email"])

# 1x1 transparent GIF
_PIXEL = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")


@router.get("/open/{token}.gif")
async def open_pixel(token: str, db: AsyncSession = Depends(get_db)):
    claims = decode_token(token)
    if claims and "u" not in claims:
        import uuid

        await svc.record_engagement(db, uuid.UUID(claims["c"]), uuid.UUID(claims["k"]), EventType.OPENED)
    return Response(content=_PIXEL, media_type="image/gif", headers={"Cache-Control": "no-store"})


@router.get("/click/{token}")
async def click_redirect(token: str, db: AsyncSession = Depends(get_db)):
    claims = decode_token(token)
    if not claims or "u" not in claims:
        raise HTTPException(status_code=404, detail="Invalid link")
    import uuid

    cid, kid = uuid.UUID(claims["c"]), uuid.UUID(claims["k"])
    await svc.record_engagement(db, cid, kid, EventType.CLICKED, {"url": claims["u"]})
    # a click implies the email was opened
    await svc.record_engagement(db, cid, kid, EventType.OPENED)
    return RedirectResponse(url=claims["u"], status_code=302)


@router.post("/events")
async def provider_events(request: Request, secret: str = Query(""), db: AsyncSession = Depends(get_db)):
    """Accepts an Amazon SNS envelope (SES notifications) or a generic
    {"events":[{"type","message_id","email?","detail?"}]} payload."""
    from app.services.email_provider_service import webhook_secret

    if secret != await webhook_secret(db):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    try:
        body = json.loads(await request.body())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    handled = 0
    if body.get("Type") == "SubscriptionConfirmation":
        url = body.get("SubscribeURL", "")
        if url.startswith("https://sns.") and ".amazonaws.com" in url.split("/")[2]:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.get(url)
        return {"ok": True, "confirmed": True}

    if body.get("Type") == "Notification":
        try:
            payload = json.loads(body.get("Message", "{}"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid SNS message")
        for kind, mid, email, detail in svc.parse_ses_notification(payload):
            handled += await svc.record_provider_event(db, kind, mid, email, detail)
    else:
        for ev in body.get("events", []):
            if ev.get("type") and ev.get("message_id"):
                handled += await svc.record_provider_event(db, ev["type"], ev["message_id"], ev.get("email"), ev.get("detail"))
    return {"ok": True, "handled": handled}
