"""Google Ads API integration via raw REST (no SDK dependency).

Credentials expected in account.credentials:
  developer_token   — Google Ads developer token
  client_id         — OAuth2 client ID
  client_secret     — OAuth2 client secret
  refresh_token     — OAuth2 refresh token
  customer_id       — Google Ads customer ID (digits only, no dashes)
  login_customer_id — (optional) MCC customer ID if using a manager account
"""
from __future__ import annotations

import re
from datetime import date

import httpx

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_ADS_BASE = "https://googleads.googleapis.com/v17/customers/{cid}"


def _clean_cid(customer_id: str) -> str:
    return re.sub(r"[^0-9]", "", customer_id)


async def _access_token(creds: dict) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.post(_TOKEN_URL, data={
            "grant_type": "refresh_token",
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "refresh_token": creds["refresh_token"],
        })
        r.raise_for_status()
        return r.json()["access_token"]


def _headers(creds: dict, token: str) -> dict:
    h = {
        "Authorization": f"Bearer {token}",
        "developer-token": creds["developer_token"],
        "Content-Type": "application/json",
    }
    if creds.get("login_customer_id"):
        h["login-customer-id"] = _clean_cid(creds["login_customer_id"])
    return h


async def create_campaign(
    creds: dict,
    name: str,
    daily_budget: float,
    currency_code: str = "USD",
    start_date: date | None = None,
    end_date: date | None = None,
) -> str:
    """Creates a PAUSED Search campaign and returns the external campaign ID."""
    token = await _access_token(creds)
    cid = _clean_cid(creds["customer_id"])
    base = _ADS_BASE.format(cid=cid)
    hdrs = _headers(creds, token)

    # Micros = amount * 1_000_000
    budget_micros = int(daily_budget * 1_000_000)
    start_str = (start_date or date.today()).strftime("%Y%m%d")
    end_str = (end_date.strftime("%Y%m%d") if end_date else "20371230")

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Create campaign budget
        br = await client.post(f"{base}/campaignBudgets:mutate", headers=hdrs, json={
            "operations": [{
                "create": {
                    "name": f"Budget – {name}",
                    "amount_micros": str(budget_micros),
                    "delivery_method": "STANDARD",
                    "explicitly_shared": False,
                }
            }]
        })
        br.raise_for_status()
        budget_resource = br.json()["results"][0]["resource_name"]

        # 2. Create campaign (PAUSED — user activates in Google Ads UI)
        cr = await client.post(f"{base}/campaigns:mutate", headers=hdrs, json={
            "operations": [{
                "create": {
                    "name": name,
                    "advertising_channel_type": "SEARCH",
                    "status": "PAUSED",
                    "campaign_budget": budget_resource,
                    "start_date": start_str,
                    "end_date": end_str,
                    "manual_cpc": {"enhanced_cpc_enabled": False},
                    "network_settings": {
                        "target_google_search": True,
                        "target_search_network": True,
                        "target_content_network": False,
                    },
                }
            }]
        })
        cr.raise_for_status()
        resource_name: str = cr.json()["results"][0]["resource_name"]
        return resource_name.split("/")[-1]  # e.g. "customers/123/campaigns/456" → "456"


async def sync_performance(creds: dict, campaign_external_id: str) -> list[dict]:
    """Returns list of {date, spend, impressions, clicks, conversions} dicts."""
    token = await _access_token(creds)
    cid = _clean_cid(creds["customer_id"])
    hdrs = _headers(creds, token)

    query = (
        "SELECT segments.date, metrics.cost_micros, metrics.impressions, "
        "metrics.clicks, metrics.conversions "
        f"FROM campaign WHERE campaign.id = {campaign_external_id} "
        "AND segments.date DURING LAST_30_DAYS "
        "ORDER BY segments.date DESC"
    )

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://googleads.googleapis.com/v17/customers/{cid}/googleAds:search",
            headers=hdrs,
            json={"query": query},
        )
        r.raise_for_status()
        results = r.json().get("results", [])

    rows: list[dict] = []
    for row in results:
        seg = row.get("segments", {})
        metrics = row.get("metrics", {})
        d = seg.get("date", "")
        if not d:
            continue
        spend = int(metrics.get("costMicros", 0)) / 1_000_000
        rows.append({
            "date": date.fromisoformat(d),
            "spend": spend,
            "impressions": int(metrics.get("impressions", 0)),
            "clicks": int(metrics.get("clicks", 0)),
            "conversions": float(metrics.get("conversions", 0)),
        })
    return rows


async def verify_credentials(creds: dict) -> bool:
    """Returns True if credentials are valid (can refresh token and reach API)."""
    try:
        token = await _access_token(creds)
        cid = _clean_cid(creds.get("customer_id", ""))
        if not cid:
            return False
        hdrs = _headers(creds, token)
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"https://googleads.googleapis.com/v17/customers/{cid}/googleAds:search",
                headers=hdrs,
                json={"query": "SELECT customer.id FROM customer LIMIT 1"},
            )
            return r.status_code < 400
    except Exception:
        return False
