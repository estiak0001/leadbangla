"""Open-pixel and click-redirect tracking for providers that don't track for us
(plain SMTP). Tokens are signed JWTs, so the public endpoints can't be used as
an open redirect or to forge events for other campaigns."""
import re
import uuid
from urllib.parse import quote

from jose import JWTError, jwt

from app.core.config import settings

_HREF = re.compile(r'(<a\b[^>]*?\shref=)(["\'])(https?://[^"\']+)\2', re.IGNORECASE)


def tracking_enabled(provider_kind: str) -> bool:
    """Our own pixel + click redirect, for providers that don't hand us engagement events."""
    return provider_kind in ("smtp", "ses")


def _token(campaign_id: uuid.UUID, contact_id: uuid.UUID, url: str | None = None) -> str:
    claims = {"c": str(campaign_id), "k": str(contact_id)}
    if url:
        claims["u"] = url
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def instrument_html(html: str, campaign_id: uuid.UUID, contact_id: uuid.UUID, api_base: str | None = None) -> str:
    base = f"{(api_base or settings.backend_public_url).rstrip('/')}/v1/public/email"

    def _rewrite(m: re.Match) -> str:
        url = m.group(3)
        return f'{m.group(1)}{m.group(2)}{base}/click/{quote(_token(campaign_id, contact_id, url))}{m.group(2)}'

    html = _HREF.sub(_rewrite, html)
    pixel = f'<img src="{base}/open/{_token(campaign_id, contact_id)}.gif" width="1" height="1" alt="" style="display:none" />'
    if re.search(r"</body>", html, re.IGNORECASE):
        return re.sub(r"</body>", pixel + "</body>", html, count=1, flags=re.IGNORECASE)
    return html + pixel
