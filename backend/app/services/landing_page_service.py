import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PlanLimitError
from app.models.contact import Contact
from app.models.landing_page import FormSubmission, LandingPage
from app.services.plan_service import get_plan_limit


class LandingPageNotFoundError(Exception):
    pass


def _slugify(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "page"
    return f"{base[:60]}-{uuid.uuid4().hex[:6]}"


# ── CRUD ──────────────────────────────────────────────────────────────────────


async def create_landing_page(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    title: str,
    blocks: list,
) -> LandingPage:
    limit = await get_plan_limit(db, org_id, "landing_pages_limit")
    if limit != -1:
        count = await db.scalar(select(func.count(LandingPage.id)).where(LandingPage.organization_id == org_id))
        if (count or 0) >= limit:
            raise PlanLimitError("landing_pages", count or 0, limit)

    page = LandingPage(
        organization_id=org_id,
        slug=_slugify(title),
        title=title,
        blocks=blocks,
    )
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page


async def get_landing_page(
    db: AsyncSession, org_id: uuid.UUID, page_id: uuid.UUID
) -> LandingPage:
    page = await db.scalar(
        select(LandingPage).where(
            LandingPage.organization_id == org_id, LandingPage.id == page_id
        )
    )
    if page is None:
        raise LandingPageNotFoundError(page_id)
    return page


async def list_landing_pages(db: AsyncSession, org_id: uuid.UUID) -> list[LandingPage]:
    result = await db.scalars(
        select(LandingPage)
        .where(LandingPage.organization_id == org_id)
        .order_by(LandingPage.created_at.desc())
    )
    return list(result)


async def update_landing_page(
    db: AsyncSession,
    org_id: uuid.UUID,
    page_id: uuid.UUID,
    *,
    title: str | None = None,
    blocks: list | None = None,
    is_published: bool | None = None,
) -> LandingPage:
    page = await get_landing_page(db, org_id, page_id)
    if title is not None:
        page.title = title
    if blocks is not None:
        page.blocks = blocks
    if is_published is not None:
        page.is_published = is_published
        if is_published and page.published_at is None:
            page.published_at = datetime.now(timezone.utc)
    page.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(page)
    return page


async def delete_landing_page(
    db: AsyncSession, org_id: uuid.UUID, page_id: uuid.UUID
) -> None:
    page = await get_landing_page(db, org_id, page_id)
    await db.delete(page)
    await db.commit()


async def submission_count(db: AsyncSession, page_id: uuid.UUID) -> int:
    return await db.scalar(
        select(func.count())
        .select_from(FormSubmission)
        .where(FormSubmission.landing_page_id == page_id)
    ) or 0


# ── Public form submission ─────────────────────────────────────────────────────


async def get_page_by_slug(db: AsyncSession, slug: str) -> LandingPage | None:
    return await db.scalar(
        select(LandingPage).where(LandingPage.slug == slug, LandingPage.is_published.is_(True))
    )


async def submit_form(
    db: AsyncSession, slug: str, field_data: dict[str, str]
) -> dict:
    page = await get_page_by_slug(db, slug)
    if page is None:
        raise LandingPageNotFoundError(slug)

    # Pull auto_tags and success_message from the form block config.
    form_block = next((b for b in page.blocks if b.get("type") == "form"), {})
    auto_tags: list[str] = form_block.get("auto_tags", [])
    success_message: str = form_block.get("success_message", "Thank you for subscribing!")

    # Map form field names to Contact columns.
    email = (field_data.get("email") or "").strip().lower() or None
    phone = (field_data.get("phone") or "").strip() or None
    first_name = (field_data.get("first_name") or "").strip() or None
    last_name = (field_data.get("last_name") or "").strip() or None

    org_id = page.organization_id
    contact: Contact | None = None

    if email:
        contact = await db.scalar(
            select(Contact).where(Contact.organization_id == org_id, Contact.email == email)
        )
    if contact is None and phone:
        contact = await db.scalar(
            select(Contact).where(Contact.organization_id == org_id, Contact.phone == phone)
        )

    from app.services.crm_service import LeadAssigner  # noqa: PLC0415
    from app.services.crm_sales_service import log_consent  # noqa: PLC0415

    company = (field_data.get("company") or "").strip()[:200] or None
    city = (field_data.get("city") or field_data.get("district") or "").strip()[:100] or None
    assigner = await LeadAssigner.create(db, org_id)
    is_new_contact = contact is None
    if contact is not None:
        # Update existing contact — merge new data in.
        contact.email = email or contact.email
        contact.phone = phone or contact.phone
        contact.first_name = first_name or contact.first_name
        contact.last_name = last_name or contact.last_name
        contact.company = contact.company or company
        contact.city = contact.city or city
        if auto_tags:
            contact.tags = sorted(set(contact.tags) | set(auto_tags))
    else:
        contact = Contact(
            organization_id=org_id,
            email=email,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            tags=auto_tags,
            company=company,
            city=city,
            source="website",
        )
        assigner.apply(contact)
        db.add(contact)

    await db.flush()
    await assigner.finish(db)

    db.add(
        FormSubmission(
            organization_id=org_id,
            landing_page_id=page.id,
            contact_id=contact.id,
            data=field_data,
        )
    )
    await db.commit()

    # Fire workflow triggers after commit so the contact row is readable by the worker.
    from app.workers.workflow_runner import fire_workflow_trigger_task  # noqa: PLC0415
    if is_new_contact:
        fire_workflow_trigger_task.delay(str(org_id), "contact_created", str(contact.id), {})
    fire_workflow_trigger_task.delay(
        str(org_id), "form_submitted", str(contact.id),
        {"landing_page_id": str(page.id)},
    )

    return {"success": True, "message": success_message}
