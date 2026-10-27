"""The one editable look applied to every internal/transactional email
LeadBangla sends (OTP, invites, alerts, notifications). `PlatformEmailBranding`
holds the style choice (accent color); who LeadBangla *is* — name, logo,
address, support contact — comes from company_settings_service, not from a
second copy of those fields here.

Customer campaign emails (sent through an org's own verified sender, see
campaign_service.py / email_domain_service.py) do NOT go through this."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.models.company_settings import PlatformCompanySettings
from app.models.email_branding import PlatformEmailBranding
from app.services.company_settings_service import get_settings as get_company_settings


def company_logo_url(company: PlatformCompanySettings) -> str | None:
    if not company.logo_content_type:
        return None
    base = (app_settings.backend_public_url or "").rstrip("/")
    # Cache-bust on every logo change (updated_at), not on every request.
    return f"{base}/v1/public/company-logo?v={int(company.updated_at.timestamp())}"


def company_logo_white_url(company: PlatformCompanySettings) -> str | None:
    if not company.logo_white_content_type:
        return None
    base = (app_settings.backend_public_url or "").rstrip("/")
    return f"{base}/v1/public/company-logo-white?v={int(company.updated_at.timestamp())}"


def company_favicon_url(company: PlatformCompanySettings) -> str | None:
    if not company.favicon_content_type:
        return None
    base = (app_settings.backend_public_url or "").rstrip("/")
    return f"{base}/v1/public/company-favicon?v={int(company.updated_at.timestamp())}"


async def get_branding(db: AsyncSession) -> PlatformEmailBranding:
    branding = await db.scalar(select(PlatformEmailBranding).limit(1))
    if branding is None:
        branding = PlatformEmailBranding()
        db.add(branding)
        await db.commit()
        await db.refresh(branding)
    return branding


async def update_branding(db: AsyncSession, *, accent_color: str | None = None, updated_by: str | None = None) -> PlatformEmailBranding:
    branding = await get_branding(db)
    if accent_color is not None:
        branding.accent_color = accent_color
    if updated_by is not None:
        branding.updated_by = updated_by
    await db.commit()
    await db.refresh(branding)
    return branding


def _lighten(hex_color: str, amount: float) -> str:
    """Blends `hex_color` towards white by `amount` (0 = unchanged, 1 = white) —
    used to derive a soft, matching footer tint from the accent color instead of
    a flat, unrelated gray."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return "#f1f5f9"
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return "#f1f5f9"
    r = round(r + (255 - r) * amount)
    g = round(g + (255 - g) * amount)
    b = round(b + (255 - b) * amount)
    return f"#{r:02x}{g:02x}{b:02x}"


def _footer_html(company: PlatformCompanySettings) -> str:
    place = ", ".join(x for x in [company.address, company.city, company.country] if x)
    lines = [f"<strong>{company.company_name}</strong>" + (f" &middot; {place}" if place else "")]
    if company.phone:
        lines.append(company.phone)
    return "<br>".join(lines)


def render_branded_email(branding: PlatformEmailBranding, company: PlatformCompanySettings, *, subject: str, inner_html: str) -> str:
    """Wraps a message fragment in one cohesive, rounded card — a colored header
    bar (the white/light logo, or the name in white if none), the content on
    white, then a footer tinted to softly match the accent color — instead of
    a flat unrelated gray. Used for every internal email so they all look like
    they come from the same place, without each call site reinventing it."""
    accent = branding.accent_color
    header_logo_url = company_logo_white_url(company) or company_logo_url(company)
    logo_block = (
        f'<img src="{header_logo_url}" alt="{company.company_name}" height="30" style="display:block;border:0;">'
        if header_logo_url
        else f'<span style="font-size:20px;font-weight:800;letter-spacing:-0.3px;color:#ffffff;">{company.company_name}</span>'
    )
    footer_bg = _lighten(accent, 0.93)
    footer_border = _lighten(accent, 0.78)
    support_line = (
        f'<a href="mailto:{company.support_email}" style="color:{accent};text-decoration:none;font-weight:600;">Need help? Contact support &rarr;</a>'
        if company.support_email
        else ""
    )
    website_line = (
        f'<a href="{company.website}" style="color:#94a3b8;text-decoration:none;">{company.website}</a>'
        if company.website
        else ""
    )
    return f"""<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:26px 36px;background:{accent};">{logo_block}</td>
            </tr>
            <tr>
              <td style="padding:36px 36px 32px;background:#ffffff;color:#1e293b;font-size:14px;line-height:1.65;">
                {inner_html}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px;background:{footer_bg};border-top:1px solid {footer_border};color:#64748b;font-size:12px;line-height:1.7;text-align:center;">
                {_footer_html(company)}
                <div style="margin-top:10px;">{support_line}{' &middot; ' if support_line and website_line else ''}{website_line}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
