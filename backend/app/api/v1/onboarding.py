from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.onboarding import OrganizationRead
from app.services.billing_service import user_has_active_subscription
from app.services.onboarding_service import (
    AlreadyOnboardedError,
    MissingRegistrationDataError,
    SubscriptionRequiredError,
    complete_onboarding,
    get_membership_for_user,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/gate")
async def gate(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    if not await user_has_active_subscription(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="An active subscription is required before onboarding",
        )
    return {"allowed": True}


@router.get("/me", response_model=OrganizationRead | None)
async def my_organization(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationRead | None:
    membership = await get_membership_for_user(db, current_user.id)
    return membership.organization if membership else None


@router.post("/complete", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
async def complete(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationRead:
    try:
        organization = await complete_onboarding(db, current_user.id)
    except SubscriptionRequiredError:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="An active subscription is required before onboarding",
        )
    except AlreadyOnboardedError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already onboarded")
    except MissingRegistrationDataError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No registration details found for this account — please contact support",
        )
    return organization
