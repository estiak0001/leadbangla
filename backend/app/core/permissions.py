"""What each team member may use. Owners and admins always have everything;
members and sales get a role default unless the owner/admin picked an explicit list."""
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.models.enums import TenantRole

# key -> (label, description)
CATALOG: dict[str, tuple[str, str]] = {
    "contacts": ("Contacts & segments", "View, add, import, export and delete contacts; segments and tags"),
    "crm": ("CRM & tasks", "Pipeline, follow-ups, customer dues and CRM reports"),
    "email": ("Email campaigns", "Create and send email campaigns, templates, sending domains"),
    "sms": ("SMS", "Send SMS campaigns, Sender ID and masking requests"),
    "whatsapp": ("WhatsApp", "WhatsApp campaigns and templates"),
    "workflows": ("Automations", "Build and run workflows"),
    "landing_pages": ("Landing pages", "Build and publish landing pages and forms"),
    "growth": ("Social, ads & growth", "Social posts, push, paid ads, events, affiliate, influencers, SEO"),
    "analytics": ("Analytics", "Dashboards and reports"),
    "billing": ("Billing & wallet", "Top up the wallet, change or renew the plan"),
    "team": ("Team management", "Invite people, change roles and access, assign work"),
}
ALL = list(CATALOG)

ROLE_DEFAULTS: dict[TenantRole, list[str]] = {
    TenantRole.OWNER: ALL,
    TenantRole.ADMIN: ALL,
    TenantRole.MEMBER: ["contacts", "crm", "email", "sms", "whatsapp", "workflows", "landing_pages", "growth", "analytics"],
    TenantRole.SALES: ["contacts", "crm"],
}


def effective_permissions(role: TenantRole, stored: list[str] | None) -> list[str]:
    if role in (TenantRole.OWNER, TenantRole.ADMIN):
        return list(ALL)
    base = ROLE_DEFAULTS[role] if stored is None else stored
    return [p for p in ALL if p in base]


def has_permission(membership, key: str) -> bool:
    return key in effective_permissions(membership.role, membership.permissions)


def require_permission(key: str, *, writes_only: bool = False):
    """Router-level guard. Requests without a bearer token pass through untouched
    (public webhooks / tracking links / checkout pages have their own checks;
    protected routes reject missing tokens themselves)."""

    async def dep(request: Request, db: AsyncSession = Depends(get_db)) -> None:
        if writes_only and request.method in ("GET", "HEAD", "OPTIONS"):
            return
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return
        try:
            payload = decode_token(auth[7:])
            if payload.get("type") != "access":
                return
            import uuid  # noqa: PLC0415
            user_id = uuid.UUID(payload["sub"])
        except Exception:  # noqa: BLE001 — bad tokens are rejected by the route's own auth
            return
        from app.services.onboarding_service import get_membership_for_user  # noqa: PLC0415

        membership = await get_membership_for_user(db, user_id)
        if membership is None:
            return  # internal staff / not onboarded: handled elsewhere
        if not has_permission(membership, key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You don't have access to {CATALOG[key][0]}. Ask your company owner or admin.",
            )

    return dep
