from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.affiliate import router as affiliate_router
from app.api.v1.events import router as events_router
from app.api.v1.paid_ads import router as paid_ads_router
from app.api.v1.influencer import router as influencer_router
from app.api.v1.push import router as push_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.crm import router as crm_router
from app.api.v1.seo import router as seo_router
from app.api.v1.landing_pages import router as landing_pages_router
from app.api.v1.public import router as public_router
from app.api.v1.workflows import router as workflows_router
from app.api.v1.sms import contacts_optin_router, router as sms_extra_router, sms_router, sms_settings_router, whatsapp_router
from app.api.v1.social import router as social_router
from app.api.v1.audience import contacts_router, segments_router, tag_presets_router
from app.api.v1.auth import router as auth_router
from app.api.v1.billing import router as billing_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.merge_tags import router as merge_tags_router
from app.api.v1.tenant_admin import router as tenant_admin_router
from app.api.v1.tenant_subscription_admin import router as tenant_subscription_admin_router
from app.api.v1.whatsapp_admin import router as whatsapp_admin_router
from app.api.v1.integrations_admin import router as integrations_admin_router
from app.api.v1.sms_gateway_admin import router as sms_gateway_admin_router
from app.api.v1.verifications import admin_router as verifications_admin_router, router as verifications_router
from app.api.v1.message_templates import router as message_templates_router
from app.api.v1.email_domains import router as email_domains_router
from app.api.v1.mail import router as mail_router
from app.api.v1.mail_admin import router as mail_admin_router
from app.api.v1.mail_inbound import router as mail_inbound_router
from app.api.v1.email_events import router as email_events_router
from app.api.v1.onboarding import router as onboarding_router
from app.api.v1.organization import router as organization_router
from app.api.v1.platform import router as platform_router
from app.api.v1.team import router as team_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.locations import router as locations_router
from app.api.v1.audience import deny_sales
from app.core.permissions import require_permission
from fastapi import Depends

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(billing_router, dependencies=[Depends(require_permission("billing", writes_only=True))])
api_router.include_router(email_domains_router, dependencies=[Depends(require_permission("email"))])
api_router.include_router(mail_router, dependencies=[Depends(require_permission("email"))])
api_router.include_router(mail_admin_router)
api_router.include_router(mail_inbound_router)
api_router.include_router(email_events_router)
api_router.include_router(onboarding_router)
api_router.include_router(organization_router)
api_router.include_router(admin_router)
api_router.include_router(contacts_router, dependencies=[Depends(require_permission("contacts"))])
api_router.include_router(segments_router, dependencies=[Depends(require_permission("contacts")), Depends(deny_sales)])
api_router.include_router(tag_presets_router, dependencies=[Depends(require_permission("contacts"))])
api_router.include_router(campaigns_router, dependencies=[Depends(require_permission("email"))])
api_router.include_router(merge_tags_router, dependencies=[Depends(require_permission("email"))])
api_router.include_router(tenant_admin_router)
api_router.include_router(tenant_subscription_admin_router)
api_router.include_router(whatsapp_admin_router)
api_router.include_router(integrations_admin_router)
api_router.include_router(sms_gateway_admin_router)
api_router.include_router(verifications_router, dependencies=[Depends(require_permission("sms"))])
api_router.include_router(verifications_admin_router)
api_router.include_router(message_templates_router, dependencies=[Depends(require_permission("email"))])
api_router.include_router(analytics_router, dependencies=[Depends(require_permission("analytics"))])
api_router.include_router(sms_router, dependencies=[Depends(require_permission("sms"))])
api_router.include_router(sms_extra_router, dependencies=[Depends(require_permission("sms"))])
api_router.include_router(sms_settings_router, dependencies=[Depends(require_permission("sms"))])
api_router.include_router(whatsapp_router, dependencies=[Depends(require_permission("whatsapp"))])
api_router.include_router(contacts_optin_router)
api_router.include_router(social_router, dependencies=[Depends(require_permission("growth"))])
api_router.include_router(landing_pages_router, dependencies=[Depends(require_permission("landing_pages"))])
api_router.include_router(public_router)
api_router.include_router(workflows_router, dependencies=[Depends(require_permission("workflows"))])
api_router.include_router(crm_router, dependencies=[Depends(require_permission("crm"))])
api_router.include_router(seo_router, dependencies=[Depends(require_permission("growth"))])
api_router.include_router(affiliate_router, dependencies=[Depends(require_permission("growth"))])
api_router.include_router(events_router, dependencies=[Depends(require_permission("growth"))])
api_router.include_router(paid_ads_router, dependencies=[Depends(require_permission("growth"))])
api_router.include_router(influencer_router, dependencies=[Depends(require_permission("growth"))])
api_router.include_router(push_router, dependencies=[Depends(require_permission("growth"))])
api_router.include_router(platform_router)
api_router.include_router(team_router)
api_router.include_router(notifications_router)
api_router.include_router(locations_router)
