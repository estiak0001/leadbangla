import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Registration business-profile fields are now collected at signup
# (schemas/auth.py's SignupRequest) rather than in a separate onboarding
# form — these Literal option sets are shared by both.
INDUSTRY_OPTIONS = Literal[
    "ecommerce_retail",
    "saas_technology",
    "education",
    "healthcare",
    "real_estate",
    "finance_banking",
    "agency_marketing",
    "manufacturing",
    "other",
]

COMPANY_SIZE_OPTIONS = Literal["1-10", "11-50", "51-200", "201-500", "500+"]


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    language: str
    phone: str | None
    website: str | None
    industry: str | None
    company_size: str | None
