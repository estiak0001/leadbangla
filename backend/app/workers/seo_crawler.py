"""SEO on-page audit crawler — zero third-party cost.

Uses httpx (already a dependency) for HTTP fetches and
beautifulsoup4 (html.parser built-in parser) for HTML analysis.
Each SeoAudit runs as a Celery task that does a bounded BFS crawl
(max MAX_PAGES pages) within the same domain as the seed URL.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.models.enums import SeoAuditStatus
from app.models.seo import SeoAudit, SeoPage
from app.workers.celery_app import celery_app

MAX_PAGES = 15
REQUEST_TIMEOUT = 15.0
HEADERS = {
    "User-Agent": "LeadBangla-SEO-Auditor/1.0 (on-page audit bot; contact your site admin to opt out)",
}


# ---------------------------------------------------------------------------
# HTML analysis
# ---------------------------------------------------------------------------

def _analyze_html(url: str, html: str, http_status: int, broken: list[str]) -> dict:
    """Return per-page SEO metrics and issue list from raw HTML."""
    issues: list[dict] = []

    if http_status >= 400 or http_status == 0:
        if http_status == 0:
            # Extract embedded error message if present
            import re as _re
            match = _re.search(r"<!-- connect_error: (.*?) -->", html)
            err_msg = match.group(1) if match else "Could not connect"
            issues.append({
                "type": "connect_error",
                "severity": "critical",
                "message": f"Connection failed: {err_msg}",
            })
        else:
            issues.append({
                "type": "http_error",
                "severity": "critical",
                "message": f"Page returned HTTP {http_status}",
            })
        return {
            "title": "", "title_length": 0,
            "meta_description": "", "meta_description_length": 0,
            "h1_count": 0, "h1_text": "",
            "canonical_url": "", "has_noindex": False,
            "img_without_alt": 0, "broken_links": broken,
            "issues": issues,
        }

    soup = BeautifulSoup(html, "html.parser")

    # --- Title ---
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""
    title_len = len(title)
    if not title:
        issues.append({"type": "missing_title", "severity": "critical", "message": "Missing <title> tag"})
    elif title_len < 30:
        issues.append({"type": "title_too_short", "severity": "warning",
                        "message": f"Title is {title_len} chars (30–60 recommended)"})
    elif title_len > 60:
        issues.append({"type": "title_too_long", "severity": "warning",
                        "message": f"Title is {title_len} chars (30–60 recommended)"})

    # --- Meta description ---
    meta_desc_tag = soup.find("meta", attrs={"name": "description"})
    desc = meta_desc_tag.get("content", "").strip() if meta_desc_tag else ""
    desc_len = len(desc)
    if not desc:
        issues.append({"type": "missing_meta_description", "severity": "critical",
                        "message": "Missing meta description"})
    elif desc_len < 50:
        issues.append({"type": "meta_description_too_short", "severity": "warning",
                        "message": f"Meta description is {desc_len} chars (50–160 recommended)"})
    elif desc_len > 160:
        issues.append({"type": "meta_description_too_long", "severity": "warning",
                        "message": f"Meta description is {desc_len} chars (50–160 recommended)"})

    # --- H1 ---
    h1_tags = soup.find_all("h1")
    h1_count = len(h1_tags)
    h1_text = h1_tags[0].get_text(strip=True)[:200] if h1_tags else ""
    if h1_count == 0:
        issues.append({"type": "missing_h1", "severity": "critical", "message": "Missing H1 heading"})
    elif h1_count > 1:
        issues.append({"type": "multiple_h1", "severity": "warning",
                        "message": f"Page has {h1_count} H1 tags (exactly 1 recommended)"})

    # --- Images without alt ---
    imgs = soup.find_all("img")
    imgs_no_alt = [i for i in imgs if not i.get("alt")]
    if imgs_no_alt:
        issues.append({"type": "images_missing_alt", "severity": "warning",
                        "message": f"{len(imgs_no_alt)} image(s) missing alt attribute"})

    # --- Canonical ---
    canonical_tag = soup.find("link", attrs={"rel": "canonical"})
    canonical_url = canonical_tag.get("href", "").strip() if canonical_tag else ""
    if not canonical_url:
        issues.append({"type": "missing_canonical", "severity": "info",
                        "message": "No canonical URL specified (<link rel='canonical'>)"})

    # --- Robots / noindex ---
    robots_meta = soup.find("meta", attrs={"name": "robots"})
    has_noindex = False
    if robots_meta:
        content = robots_meta.get("content", "").lower()
        if "noindex" in content:
            has_noindex = True
            issues.append({"type": "noindex_directive", "severity": "critical",
                            "message": "Page has noindex directive — excluded from search engines"})

    # --- Open Graph ---
    if not soup.find("meta", attrs={"property": "og:title"}):
        issues.append({"type": "missing_og_title", "severity": "info",
                        "message": "Missing og:title meta tag"})
    if not soup.find("meta", attrs={"property": "og:description"}):
        issues.append({"type": "missing_og_description", "severity": "info",
                        "message": "Missing og:description meta tag"})

    # --- Broken links ---
    if broken:
        sample = broken[:3]
        issues.append({"type": "broken_links", "severity": "critical",
                        "message": f"{len(broken)} broken internal link(s): {', '.join(sample)}"})

    return {
        "title": title,
        "title_length": title_len,
        "meta_description": desc,
        "meta_description_length": desc_len,
        "h1_count": h1_count,
        "h1_text": h1_text,
        "canonical_url": canonical_url,
        "has_noindex": has_noindex,
        "img_without_alt": len(imgs_no_alt),
        "broken_links": broken,
        "issues": issues,
    }


def _normalize_url(base_url: str, href: str, base_domain: str) -> str | None:
    """Return the normalized URL if same-domain, else None."""
    if href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    full = urljoin(base_url, href)
    parsed = urlparse(full)
    if parsed.netloc != base_domain:
        return None
    # Strip fragment and normalize
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}" + (
        f"?{parsed.query}" if parsed.query else ""
    )


# ---------------------------------------------------------------------------
# Async crawler core
# ---------------------------------------------------------------------------

async def _crawl_async(audit_id: str, seed_url: str) -> None:
    engine = create_async_engine(settings.database_url, echo=False)

    try:
        async with AsyncSession(engine) as db:
            audit = await db.get(SeoAudit, uuid.UUID(audit_id))
            if not audit:
                return
            audit.status = SeoAuditStatus.RUNNING
            audit.started_at = datetime.now(timezone.utc)
            await db.commit()

        base_domain = urlparse(seed_url).netloc

        # BFS crawl — collect {url: {status, html, links}}
        crawled: dict[str, dict] = {}
        queue = [seed_url]

        async with httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
            headers=HEADERS,
            verify=False,  # bypass SSL cert chain issues common on smaller/shared-hosting sites
        ) as client:
            while queue and len(crawled) < MAX_PAGES:
                url = queue.pop(0)
                if url in crawled:
                    continue

                try:
                    resp = await client.get(url)
                    status = resp.status_code
                    ct = resp.headers.get("content-type", "")
                    html = resp.text if "html" in ct else ""
                except httpx.TimeoutException:
                    status = 0
                    html = "<!-- connect_error: Request timed out -->"
                except Exception as e:
                    status = 0
                    html = f"<!-- connect_error: {e} -->"

                internal_links: list[str] = []
                if html:
                    soup = BeautifulSoup(html, "html.parser")
                    for a in soup.find_all("a", href=True):
                        norm = _normalize_url(url, a["href"], base_domain)
                        if norm and norm not in crawled:
                            internal_links.append(norm)
                            if norm not in queue:
                                queue.append(norm)

                crawled[url] = {"status": status, "html": html, "links": internal_links}

        # Determine broken URLs (non-200 status when crawled)
        broken_urls: set[str] = {
            u for u, d in crawled.items() if d["status"] >= 400 or d["status"] == 0
        }

        # Persist SeoPage rows
        async with AsyncSession(engine) as db:
            audit = await db.get(SeoAudit, uuid.UUID(audit_id))
            if not audit:
                return

            for url, data in crawled.items():
                broken_on_page = [lk for lk in data["links"] if lk in broken_urls]
                analysis = _analyze_html(url, data["html"], data["status"], broken_on_page)

                page = SeoPage(
                    audit_id=audit.id,
                    organization_id=audit.organization_id,
                    url=url,
                    http_status=data["status"],
                    internal_links_count=len(data["links"]),
                    **analysis,
                )
                db.add(page)

            audit.status = SeoAuditStatus.COMPLETED
            audit.pages_crawled = len(crawled)
            audit.completed_at = datetime.now(timezone.utc)
            await db.commit()

    except Exception as exc:
        async with AsyncSession(engine) as db:
            audit = await db.get(SeoAudit, uuid.UUID(audit_id))
            if audit:
                audit.status = SeoAuditStatus.FAILED
                audit.error_message = str(exc)[:500]
                await db.commit()

    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@celery_app.task(name="tasks.crawl_site")
def crawl_site_task(audit_id: str, seed_url: str) -> None:
    asyncio.run(_crawl_async(audit_id, seed_url))
