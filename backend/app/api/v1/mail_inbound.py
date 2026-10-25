"""Public webhook: Amazon SNS tells us SES received an email for one of our customers' domains."""
import json
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.email_provider_service import get_ses_config, webhook_secret

router = APIRouter(prefix="/public/mail", tags=["public-mail"])
log = logging.getLogger("mail")


@router.post("/inbound")
async def inbound(request: Request, secret: str = Query(""), db: AsyncSession = Depends(get_db)) -> dict:
    if secret != await webhook_secret(db):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    try:
        body = json.loads(await request.body())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    cfg = await get_ses_config(db)
    expected_topic = (cfg or {}).get("inbound_topic_arn")
    if expected_topic and body.get("TopicArn") and body["TopicArn"] != expected_topic:
        raise HTTPException(status_code=403, detail="Unexpected topic")

    if body.get("Type") == "SubscriptionConfirmation":
        url = body.get("SubscribeURL", "")
        if url.startswith("https://sns.") and ".amazonaws.com" in url.split("/")[2]:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.get(url)
            return {"ok": True, "confirmed": True}
        raise HTTPException(status_code=400, detail="Bad subscription URL")

    note = body
    if body.get("Type") == "Notification":
        try:
            note = json.loads(body.get("Message", "{}"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid SNS message")
    if note.get("notificationType") != "Received":
        return {"ok": True, "ignored": True}

    from app.workers.tasks import process_inbound_mail_task  # noqa: PLC0415

    process_inbound_mail_task.delay(note)
    return {"ok": True, "queued": True}
