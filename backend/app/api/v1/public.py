"""Public (unauthenticated) API endpoints.

Currently hosts:
- GET  /public/landing-pages/{slug}  — fetch published page config for rendering
- POST /public/landing-pages/{slug}/submit — submit a landing page form (creates / updates Contact)
- POST /public/sms/inbound — SSL Wireless webhook for inbound (MO) SMS replies
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.schemas.landing_page import FormSubmitRequest, FormSubmitResponse
from app.services import affiliate_service as aff_svc
from app.services import landing_page_service as svc
from app.services import sms_service

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/company-logo")
async def company_logo(db: AsyncSession = Depends(get_db)):
    """Embedded as <img src> in every internal email — must be publicly reachable, no auth."""
    from app.services.company_settings_service import get_settings_with_logo  # noqa: PLC0415

    company = await get_settings_with_logo(db)
    if not company.logo_data or not company.logo_content_type:
        raise HTTPException(status_code=404, detail="No logo set")
    return Response(content=company.logo_data, media_type=company.logo_content_type, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/company-logo-white")
async def company_logo_white(db: AsyncSession = Depends(get_db)):
    """Light/white logo variant for dark or colored backgrounds (email header bar, dark sidebars)."""
    from app.services.company_settings_service import get_settings_with_logo_white  # noqa: PLC0415

    company = await get_settings_with_logo_white(db)
    if not company.logo_white_data or not company.logo_white_content_type:
        raise HTTPException(status_code=404, detail="No white logo set")
    return Response(content=company.logo_white_data, media_type=company.logo_white_content_type, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/company-favicon")
async def company_favicon(db: AsyncSession = Depends(get_db)):
    from app.services.company_settings_service import get_settings_with_favicon  # noqa: PLC0415

    company = await get_settings_with_favicon(db)
    if not company.favicon_data or not company.favicon_content_type:
        raise HTTPException(status_code=404, detail="No favicon set")
    return Response(content=company.favicon_data, media_type=company.favicon_content_type, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/landing-pages/{slug}")
async def get_public_page(slug: str, db: AsyncSession = Depends(get_db)):
    page = await svc.get_page_by_slug(db, slug)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"title": page.title, "slug": page.slug, "blocks": page.blocks}


@router.get("/ref/{code}")
async def track_referral_click(
    code: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Record a referral link click and redirect to the program's target URL."""
    click, target_url, cookie_days = await aff_svc.record_click(
        db,
        code,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        referer=request.headers.get("referer"),
    )
    if click is None:
        raise HTTPException(status_code=404, detail="Referral link not found")

    response = RedirectResponse(url=target_url, status_code=302)
    response.set_cookie(
        key="ref_code",
        value=code,
        max_age=cookie_days * 86400,
        samesite="lax",
    )
    return response


@router.post("/landing-pages/{slug}/submit", response_model=FormSubmitResponse)
async def submit_landing_page_form(
    slug: str,
    body: FormSubmitRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await svc.submit_form(db, slug, body.fields)
    except svc.LandingPageNotFoundError:
        raise HTTPException(status_code=404, detail="Page not found or not published")
    return FormSubmitResponse(**result)


@router.post("/sms/inbound", status_code=204)
async def sslwireless_inbound_webhook(
    payload: dict,
    secret: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """SSL Wireless calls this when a customer replies to an SMS/masking ID.

    Exact field names aren't verified against SSL Wireless's own inbound
    webhook spec (not available at build time) — this accepts the common
    aliases aggregators use and should be confirmed/adjusted once you have
    their actual webhook documentation or a live test payload.
    """
    if secret != settings.sslwireless_webhook_secret:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    from_phone = payload.get("msisdn") or payload.get("from") or payload.get("sender") or payload.get("mobile")
    body = payload.get("sms") or payload.get("message") or payload.get("text") or payload.get("content")
    to_sender_id = payload.get("sid") or payload.get("mask") or payload.get("to")

    if not from_phone or not body:
        raise HTTPException(status_code=422, detail="Payload missing sender phone or message body")

    await sms_service.record_inbound_sms(db, from_phone=from_phone, to_sender_id=to_sender_id, body=body)


# ── WhatsApp Cloud API webhook (Meta) ─────────────────────────────────────────

@router.get("/whatsapp/webhook")
async def whatsapp_webhook_verify(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    db: AsyncSession = Depends(get_db),
):
    """Meta calls this once when you save the webhook URL, to check it is really yours."""
    from app.services import whatsapp_webhook_service as wh  # noqa: PLC0415
    from fastapi.responses import PlainTextResponse  # noqa: PLC0415

    token = (await wh.stored_creds(db)).get("verify_token")
    if hub_mode != "subscribe" or not token or hub_verify_token != token or hub_challenge is None:
        raise HTTPException(status_code=403, detail="Verification failed")
    return PlainTextResponse(hub_challenge)


@router.post("/whatsapp/webhook", status_code=200)
async def whatsapp_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Delivery receipts and replies from Meta. The body is signed with the app secret."""
    from app.services import whatsapp_webhook_service as wh  # noqa: PLC0415

    raw = await request.body()
    secret = (await wh.stored_creds(db)).get("app_secret", "")
    if not wh.valid_signature(secret, raw, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status_code=401, detail="Bad signature")
    try:
        await wh.handle(db, json.loads(raw))
    except Exception:  # noqa: BLE001 — always answer 200 so Meta doesn't retry a payload we can't parse
        import logging  # noqa: PLC0415

        logging.getLogger(__name__).exception("WhatsApp webhook failed")
    return {"ok": True}


@router.get("/whatsapp/webhook/{key}")
async def whatsapp_org_webhook_verify(
    key: str,
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    db: AsyncSession = Depends(get_db),
):
    """Handshake for a customer's own Meta app (each customer has their own URL)."""
    from fastapi.responses import PlainTextResponse  # noqa: PLC0415
    from app.services import whatsapp_webhook_service as wh  # noqa: PLC0415

    token = (await wh.org_creds(db, key)).get("verify_token")
    if hub_mode != "subscribe" or not token or hub_verify_token != token or hub_challenge is None:
        raise HTTPException(status_code=403, detail="Verification failed")
    return PlainTextResponse(hub_challenge)


@router.post("/whatsapp/webhook/{key}", status_code=200)
async def whatsapp_org_webhook(key: str, request: Request, db: AsyncSession = Depends(get_db)):
    from app.services import whatsapp_webhook_service as wh  # noqa: PLC0415

    raw = await request.body()
    if not wh.valid_signature((await wh.org_creds(db, key)).get("app_secret", ""), raw, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status_code=401, detail="Bad signature")
    try:
        await wh.handle(db, json.loads(raw))
    except Exception:  # noqa: BLE001
        import logging  # noqa: PLC0415

        logging.getLogger(__name__).exception("WhatsApp org webhook failed")
    return {"ok": True}


# ── Web push: subscribe from a customer's website or shareable link ───────────

_CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"}

_PUSH_SW = """// LeadBangla web push — loaded by your site's service worker file.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(clients.claim()); });
self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: "Notification", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Notification", {
    body: d.body || "", icon: d.icon || undefined, data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if (list[i].url === url && "focus" in list[i]) return list[i].focus(); }
    return clients.openWindow ? clients.openWindow(url) : undefined;
  }));
});
"""

_PUSH_SDK = """(function () {
  var script = document.currentScript;
  var key = script && script.getAttribute("data-key");
  var swPath = (script && script.getAttribute("data-sw")) || "/leadbangla-sw.js";
  var api = new URL(script.src).origin + "/api/v1/public/push/" + key;
  function b64(s) { var p = "=".repeat((4 - s.length % 4) % 4); var r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, function (c) { return c.charCodeAt(0); }); }
  async function subscribe(opts) {
    opts = opts || {};
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "unsupported" };
    var info = await (await fetch(api + "/info")).json();
    if (!info.ready) return { ok: false, reason: "not-ready" };
    if ((await Notification.requestPermission()) !== "granted") return { ok: false, reason: "denied" };
    var reg = await navigator.serviceWorker.register(swPath);
    await navigator.serviceWorker.ready;
    var sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(info.public_key) }));
    var j = sub.toJSON();
    var res = await fetch(api + "/subscribe", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, email: opts.email || null, source: "website", user_agent: navigator.userAgent.slice(0, 200) }) });
    return { ok: res.ok };
  }
  window.LeadBanglaPush = { subscribe: subscribe };
  var auto = script && script.getAttribute("data-auto");
  if (auto) setTimeout(function () { if (Notification.permission === "default") subscribe(); }, Math.max(1, Number(auto)) * 1000);
})();
"""


@router.options("/push/{path:path}")
async def push_preflight(path: str):
    from fastapi import Response  # noqa: PLC0415

    return Response(status_code=204, headers=_CORS)


@router.get("/push/sw.js")
async def push_sw():
    from fastapi import Response  # noqa: PLC0415

    return Response(_PUSH_SW, media_type="application/javascript", headers={**_CORS, "Cache-Control": "public, max-age=300"})


@router.get("/push/sdk.js")
async def push_sdk():
    from fastapi import Response  # noqa: PLC0415

    return Response(_PUSH_SDK, media_type="application/javascript", headers={**_CORS, "Cache-Control": "public, max-age=300"})


async def _push_org(db: AsyncSession, site_key: str):
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.organization import Organization  # noqa: PLC0415
    from app.models.push import PushConfig  # noqa: PLC0415

    cfg = await db.scalar(select(PushConfig).where(PushConfig.site_key == site_key))
    if cfg is None:
        raise HTTPException(status_code=404, detail="Unknown site key", headers=_CORS)
    org = await db.get(Organization, cfg.organization_id)
    return cfg, org


@router.get("/push/{site_key}/info")
async def push_info(site_key: str, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse  # noqa: PLC0415

    from app.services import push_service  # noqa: PLC0415

    cfg, org = await _push_org(db, site_key)
    keys = await push_service.vapid_keys(db, cfg.organization_id, cfg)
    return JSONResponse({"ready": bool(keys), "public_key": keys["public"] if keys else None,
                         "name": (org.display_name or org.name) if org else ""}, headers=_CORS)


@router.post("/push/{site_key}/subscribe")
async def push_subscribe(site_key: str, body: dict, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse  # noqa: PLC0415

    from app.schemas.push import PushTokenRegister  # noqa: PLC0415
    from app.services import push_service  # noqa: PLC0415

    cfg, _ = await _push_org(db, site_key)
    endpoint, p256dh, auth = body.get("endpoint"), body.get("p256dh"), body.get("auth")
    if not (isinstance(endpoint, str) and endpoint.startswith("https://") and len(endpoint) < 1500 and isinstance(p256dh, str) and isinstance(auth, str)
            and len(p256dh) < 200 and len(auth) < 100):
        raise HTTPException(status_code=422, detail="Invalid subscription", headers=_CORS)
    email = body.get("email") if isinstance(body.get("email"), str) and "@" in body["email"] and len(body["email"]) < 320 else None
    source = "link" if body.get("source") == "link" else "website"
    await push_service.register_token(
        db, cfg.organization_id,
        PushTokenRegister(endpoint=endpoint, p256dh=p256dh, auth=auth, user_agent=(body.get("user_agent") or "")[:200] or None),
        email, source=source)
    return JSONResponse({"ok": True}, headers=_CORS)
