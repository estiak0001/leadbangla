"""Meta Marketing API integration via raw REST (no SDK dependency).

Credentials expected in account.credentials:
  access_token   — Long-lived user or system access token
  ad_account_id  — Ad account ID, with or without "act_" prefix
  app_id         — Meta App ID (optional, for token refresh)
  app_secret     — Meta App Secret (optional, for token refresh)

Meta campaign objectives (v19.0):
  OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT,
  OUTCOME_LEADS, OUTCOME_APP_PROMOTION, OUTCOME_SALES
"""
from __future__ import annotations

from datetime import date

import httpx

_GRAPH = "https://graph.facebook.com/v19.0"


def _account_id(creds: dict) -> str:
    aid = creds.get("ad_account_id", "")
    return aid if aid.startswith("act_") else f"act_{aid}"


def _token(creds: dict) -> str:
    return creds["access_token"]


async def create_campaign(
    creds: dict,
    name: str,
    objective: str = "OUTCOME_TRAFFIC",
    daily_budget: float = 5.0,
    currency: str = "USD",
    start_date: date | None = None,
) -> str:
    """Creates a PAUSED campaign and returns the external campaign ID."""
    account = _account_id(creds)
    token = _token(creds)

    # Meta campaign-level budget requires CBO (Advantage Campaign Budget).
    # Without budget_optimization_switch the API rejects daily_budget for most objectives.
    daily_budget_cents = int(daily_budget * 100)

    payload: dict = {
        "name": name,
        "objective": objective,
        "status": "PAUSED",
        "special_ad_categories": [],
        "daily_budget": daily_budget_cents,
        "budget_optimization_switch": "ON",
        "access_token": token,
    }
    if start_date:
        payload["start_time"] = f"{start_date}T00:00:00-0000"

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{_GRAPH}/{account}/campaigns", json=payload)
        r.raise_for_status()
        return r.json()["id"]


async def sync_performance(creds: dict, campaign_id: str) -> list[dict]:
    """Returns list of {date, spend, impressions, clicks, conversions} dicts."""
    token = _token(creds)
    params = {
        "access_token": token,
        "fields": "date_start,spend,impressions,clicks,actions",
        "time_increment": 1,
        "date_preset": "last_30d",
        "level": "campaign",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{_GRAPH}/{campaign_id}/insights", params=params)
        r.raise_for_status()
        data = r.json().get("data", [])

    rows: list[dict] = []
    for item in data:
        d_str = item.get("date_start", "")
        if not d_str:
            continue
        # Meta "actions" array: filter for purchase/lead conversions
        actions = item.get("actions", [])
        conversions = sum(
            float(a.get("value", 0))
            for a in actions
            if a.get("action_type") in ("purchase", "lead", "complete_registration")
        )
        rows.append({
            "date": date.fromisoformat(d_str),
            "spend": float(item.get("spend", 0)),
            "impressions": int(item.get("impressions", 0)),
            "clicks": int(item.get("clicks", 0)),
            "conversions": conversions,
        })
    return rows


async def verify_credentials(creds: dict) -> bool:
    """Returns True if the access token is valid."""
    try:
        token = _token(creds)
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{_GRAPH}/me", params={"access_token": token, "fields": "id"})
            return r.status_code == 200
    except Exception:
        return False
