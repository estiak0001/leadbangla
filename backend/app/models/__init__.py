"""Importing this package registers every model with SQLAlchemy's mapper
registry. Required wherever code only imports a subset of models directly
(e.g. the Celery worker importing just Campaign) but still needs foreign
keys to tables like `organizations` or `users` to resolve — without this,
SQLAlchemy raises NoReferencedTableError for any FK whose target model
was never imported in that process."""

from app.models.affiliate import Commission, ReferralClick, ReferralLink, ReferralProgram
from app.models.event_marketing import EventRegistration, MarketingEvent
from app.models.paid_ads import AdCampaign, AdSpendRecord, PaidAdsAccount
from app.models.influencer import Deliverable, Influencer
from app.models.notification_settings import OrgNotificationSettings
from app.models.platform_service import PlatformService
from app.models.push import PushCampaign, PushConfig, PushToken
from app.models.billing import CreditRate, Plan, Subscription
from app.models.campaign import Campaign
from app.models.campaign_history import CampaignHistory
from app.models.inbox import Notification, UserNotificationPref
from app.models.crm import (
    ConsentLog, ContactNote, CrmActivity, CrmDue, CrmSettings, CrmTask, CrmTaskComment, CustomFieldDefinition, Location, PipelineStage, TeamAccessPreset, TeamAuditLog,
)
from app.models.seo import SeoAudit, SeoPage
from app.models.contact import Contact
from app.models.email_domain import EmailSuppression, SenderAddress, SendingDomain
from app.models.contact_history import ContactHistory
from app.models.event import Event
from app.models.mail import InboxAddress, InboxDomain, MailAttachment, MailMessage, MailThread, MailUpload
from app.models.organization import Organization, OrganizationMember
from app.models.segment import Segment, SegmentHistory
from app.models.landing_page import FormSubmission, LandingPage
from app.models.sms import SmsCampaign, SmsEvent, SmsSkipEvent
from app.models.social import SocialAccount, SocialPost
from app.models.merge_tag import MergeTag
from app.models.message_template import MessageTemplate
from app.models.tag_preset import TagPreset
from app.models.verification import VerificationDocument, VerificationRequest
from app.models.whatsapp_health import WhatsAppHealth
from app.models.whatsapp_template import WhatsAppTemplateRequest
from app.models.user import User
from app.models.wallet import OrgWallet, WalletTopUp, WalletTransaction
from app.models.workflow import Workflow, WorkflowEnrollment, WorkflowStepLog

__all__ = [
    "AdCampaign",
    "AdSpendRecord",
    "Commission",
    "Deliverable",
    "EventRegistration",
    "MarketingEvent",
    "PaidAdsAccount",
    "Influencer",
    "OrgNotificationSettings",
    "PlatformService",
    "PushCampaign",
    "PushConfig",
    "PushToken",
    "ReferralClick",
    "ReferralLink",
    "ReferralProgram",
    "CreditRate",
    "Plan",
    "Subscription",
    "Campaign",
    "Contact",
    "ContactHistory",
    "ContactNote",
    "Event",
    "FormSubmission",
    "LandingPage",
    "Organization",
    "OrganizationMember",
    "OrgEmailSender",
    "PipelineStage",
    "Segment",
    "SeoAudit",
    "SeoPage",
    "SmsCampaign",
    "SmsEvent",
    "SmsSkipEvent",
    "SocialAccount",
    "SocialPost",
    "TagPreset",
    "OrgWallet",
    "WalletTopUp",
    "WalletTransaction",
    "User",
    "Workflow",
    "WorkflowEnrollment",
    "WorkflowStepLog",
]
