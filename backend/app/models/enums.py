import enum


class TenantRole(str, enum.Enum):
    """Roles within an Organization — assigned once one exists (Step 4)."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    SALES = "sales"


class InternalRole(str, enum.Enum):
    """Roles for internal staff accounts, provisioned outside public signup."""

    STAFF = "staff"
    SUPERADMIN = "superadmin"


class SubscriptionStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OrgLanguage(str, enum.Enum):
    BN = "bn"
    EN = "en"


class CampaignChannel(str, enum.Enum):
    EMAIL = "email"


class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EventType(str, enum.Enum):
    SENT = "sent"
    OPENED = "opened"
    CLICKED = "clicked"
    BOUNCED = "bounced"
    FAILED = "failed"


class SmsChannel(str, enum.Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"


class SmsCampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"


class SmsEventType(str, enum.Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"


class SocialPlatform(str, enum.Enum):
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    LINKEDIN = "linkedin"


class SocialPostStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    FAILED = "failed"


class WorkflowTriggerType(str, enum.Enum):
    CONTACT_CREATED = "contact_created"
    TAG_ADDED = "tag_added"
    FORM_SUBMITTED = "form_submitted"
    MANUAL = "manual"
    EVENT_REGISTERED = "event_registered"
    STAGE_ENTERED = "stage_entered"


class WorkflowEnrollmentStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class WorkflowStepStatus(str, enum.Enum):
    EXECUTED = "executed"
    SKIPPED = "skipped"
    FAILED = "failed"


class SeoAuditStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
