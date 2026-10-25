import uuid

from app.core.exceptions import PlanLimitError

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.contact import Contact
from app.models.enums import TenantRole
from app.models.organization import OrganizationMember
from app.schemas.audience import (
    BulkDeleteResult,
    ContactBulkDeleteRequest,
    ContactCreate,
    ContactDeleteByTagRequest,
    ContactHistoryRead,
    ContactImportResult,
    ContactRead,
    ContactUpdate,
    SegmentCreate,
    SegmentPreviewRequest,
    SegmentRead,
    SegmentReach,
    SegmentRule,
    TagPresetCreate,
    TagPresetRead,
)
from app.services.audience_service import (
    ContactHistoryNotFoundError,
    ContactNotFoundError,
    SegmentInUseError,
    SegmentNameTakenError,
    SegmentNotFoundError,
    duplicate_segment,
    list_segment_history,
    list_templates,
    list_trashed_segments,
    purge_segment,
    restore_default_templates,
    restore_segment,
    revert_segment,
    segment_reach,
    segment_usage,
    trash_segment,
    TagPresetExistsError,
    TagPresetNotFoundError,
    count_matching_contacts,
    create_contact,
    find_duplicate,
    create_segment,
    create_tag_preset,
    delete_tag_preset,
    get_segment,
    import_contacts_csv,
    list_contact_history,
    list_contacts,
    list_matching_contacts,
    list_segments,
    list_segments_for_contact,
    list_tag_presets,
    list_trashed_contacts,
    purge_contact,
    ContactRestoreConflictError,
    restore_contact,
    revert_contact_history,
    soft_delete_contacts,
    soft_delete_contacts_by_tag,
    update_contact,
    update_segment,
)

async def deny_sales(membership: OrganizationMember = Depends(get_current_membership)) -> None:
    if membership.role == TenantRole.SALES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your role can't do bulk contact changes. Ask your admin.")


async def _own_contact_only(db: AsyncSession, membership: OrganizationMember, contact_id: uuid.UUID) -> None:
    """Sales people can edit / delete only the leads they own."""
    if membership.role != TenantRole.SALES:
        return
    c = await db.get(Contact, contact_id)
    if c is None or c.organization_id != membership.organization_id or c.owner_user_id != membership.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")


contacts_router = APIRouter(prefix="/contacts", tags=["audience"])
segments_router = APIRouter(prefix="/segments", tags=["audience"])
tag_presets_router = APIRouter(prefix="/tag-presets", tags=["audience"])


@contacts_router.post("/import", response_model=ContactImportResult, dependencies=[Depends(deny_sales)])
async def import_contacts(
    file: UploadFile = File(...),
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> ContactImportResult:
    if file.filename is None or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expected a .csv file")
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is too large (max 10 MB).")
    from app.services.contact_import import import_contacts_csv as run_import  # noqa: PLC0415

    try:
        result = await run_import(db, membership.organization_id, contents, membership.user_id, membership.role.value)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ContactImportResult(**result)


@contacts_router.post("", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
async def create_contact_route(
    body: ContactCreate,
    force: bool = False,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> ContactRead:
    if not body.email and not body.phone:
        raise HTTPException(status_code=400, detail="email or phone is required")
    if not force:
        dup = await find_duplicate(db, membership.organization_id, body.email, body.phone)
        if dup is not None:
            name = " ".join(x for x in [dup.first_name, dup.last_name] if x) or dup.email or dup.phone
            raise HTTPException(status_code=409, detail={
                "code": "duplicate", "contact_id": str(dup.id), "name": name,
                "message": f"{name} is already in your contacts with the same "
                           f"{'email' if body.email and dup.email and dup.email.lower() == body.email.lower() else 'phone number'}.",
            })
    from app.services import crm_sales_service as sales  # noqa: PLC0415

    extra = body.model_dump(include={"company", "address", "source", "whatsapp_number", "facebook_url",
                                     "customer_type", "sms_opt_in", "whatsapp_opt_in", "expected_close_date"})
    from app.services.geo import check_pair  # noqa: PLC0415

    try:
        lat, lng = check_pair(body.latitude, body.longitude)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if lat is not None:
        extra["latitude"], extra["longitude"] = lat, lng
    if body.owner_user_id is not None:
        if membership.role == TenantRole.SALES and body.owner_user_id != membership.user_id:
            raise HTTPException(status_code=403, detail="Your role can only add leads for yourself")
        ok = await db.scalar(select(OrganizationMember.id).where(
            OrganizationMember.organization_id == membership.organization_id, OrganizationMember.user_id == body.owner_user_id,
            OrganizationMember.is_active.is_(True)))
        if ok is None:
            raise HTTPException(status_code=400, detail="That person is not an active member of your team")
        extra["owner_user_id"] = body.owner_user_id
    from app.services.location_service import resolve_place  # noqa: PLC0415

    place = await resolve_place(db, membership.organization_id, division=body.division, district=body.district, area=body.area, city=body.city)
    extra.update({k: place[k] for k in ("division", "district", "area", "city")})
    if body.deal_value is not None:
        extra["deal_value"] = int(round(body.deal_value * 100))
    if body.custom_fields:
        try:
            extra["custom_fields"] = await sales.clean_custom_fields(db, membership.organization_id, body.custom_fields)
        except sales.CrmError as e:
            raise HTTPException(status_code=400, detail=str(e))
    contact = await create_contact(
        db,
        membership.organization_id,
        email=body.email,
        phone=body.phone,
        first_name=body.first_name,
        last_name=body.last_name,
        tags=body.tags,
        changed_by_user_id=membership.user_id,
        actor_role=membership.role.value,
        extra=extra,
    )
    return ContactRead.model_validate(contact)


@contacts_router.get("", response_model=list[ContactRead])
async def get_contacts(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[ContactRead]:
    own = membership.user_id if membership.role == TenantRole.SALES else None
    return await list_contacts(db, membership.organization_id, owner_user_id=own)


@contacts_router.get("/trash", response_model=list[ContactRead], dependencies=[Depends(deny_sales)])
async def get_trashed_contacts(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[ContactRead]:
    return await list_trashed_contacts(db, membership.organization_id)


class TrashIds(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


@contacts_router.post("/trash/bulk-restore", dependencies=[Depends(deny_sales)])
async def bulk_restore_route(
    body: TrashIds,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Restore many contacts from Trash. Ones that can't come back (same email/phone already in use,
    plan limit) are reported with a reason; the rest are restored."""
    restored: list[str] = []
    failed: list[dict] = []
    for cid in body.ids:
        try:
            await restore_contact(db, membership.organization_id, cid, changed_by_user_id=membership.user_id)
            restored.append(str(cid))
        except ContactNotFoundError:
            failed.append({"id": str(cid), "reason": "not in Trash any more"})
        except ContactRestoreConflictError as e:
            failed.append({"id": str(cid), "reason": f"you already have a contact with {e}"})
        except PlanLimitError:
            failed.append({"id": str(cid), "reason": "your plan's contact limit is reached"})
            break
    return {"restored": restored, "failed": failed}


@contacts_router.post("/trash/bulk-purge", dependencies=[Depends(deny_sales)])
async def bulk_purge_route(
    body: TrashIds,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Permanently delete many contacts from Trash. Cannot be undone."""
    deleted = 0
    for cid in body.ids:
        try:
            await purge_contact(db, membership.organization_id, cid)
            deleted += 1
        except ContactNotFoundError:
            pass
    return {"deleted": deleted}


@contacts_router.post("/trash/{contact_id}/restore", response_model=ContactRead, dependencies=[Depends(deny_sales)])
async def restore_contact_route(
    contact_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> ContactRead:
    try:
        return await restore_contact(db, membership.organization_id, contact_id, changed_by_user_id=membership.user_id)
    except ContactNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found in trash")
    except ContactRestoreConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Can't restore: you already have a contact with {e}. Delete or edit that one first.",
        )


@contacts_router.delete("/trash/{contact_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(deny_sales)])
async def purge_contact_route(
    contact_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await purge_contact(db, membership.organization_id, contact_id)
    except ContactNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found in trash")


@contacts_router.post("/bulk-delete", response_model=BulkDeleteResult, dependencies=[Depends(deny_sales)])
async def bulk_delete_contacts_route(
    body: ContactBulkDeleteRequest,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> BulkDeleteResult:
    deleted = await soft_delete_contacts(
        db, membership.organization_id, body.contact_ids, changed_by_user_id=membership.user_id
    )
    return BulkDeleteResult(deleted=deleted)


@contacts_router.post("/delete-by-tag", response_model=BulkDeleteResult, dependencies=[Depends(deny_sales)])
async def delete_contacts_by_tag_route(
    body: ContactDeleteByTagRequest,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> BulkDeleteResult:
    deleted = await soft_delete_contacts_by_tag(
        db, membership.organization_id, body.tag, changed_by_user_id=membership.user_id
    )
    return BulkDeleteResult(deleted=deleted)


@contacts_router.patch("/{contact_id}", response_model=ContactRead)
async def update_contact_route(
    contact_id: uuid.UUID,
    body: ContactUpdate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> ContactRead:
    if not body.email and not body.phone:
        raise HTTPException(status_code=400, detail="email or phone is required")
    await _own_contact_only(db, membership, contact_id)
    try:
        return await update_contact(
            db,
            membership.organization_id,
            contact_id,
            email=body.email,
            phone=body.phone,
            first_name=body.first_name,
            last_name=body.last_name,
            tags=body.tags,
            changed_by_user_id=membership.user_id,
        )
    except ContactNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")


@contacts_router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact_route(
    contact_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _own_contact_only(db, membership, contact_id)
    deleted = await soft_delete_contacts(
        db, membership.organization_id, [contact_id], changed_by_user_id=membership.user_id
    )
    if deleted == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")


@contacts_router.get("/{contact_id}/history", response_model=list[ContactHistoryRead])
async def get_contact_history_route(
    contact_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[ContactHistoryRead]:
    return await list_contact_history(db, membership.organization_id, contact_id)


@contacts_router.post("/{contact_id}/history/{history_id}/restore", response_model=ContactRead)
async def restore_contact_history_route(
    contact_id: uuid.UUID,
    history_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> ContactRead:
    try:
        return await revert_contact_history(
            db, membership.organization_id, contact_id, history_id, changed_by_user_id=membership.user_id
        )
    except ContactNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    except ContactHistoryNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="History entry not found or has nothing to restore")


@contacts_router.get("/{contact_id}/segments", response_model=list[SegmentRead])
async def get_contact_segments(
    contact_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SegmentRead]:
    segments = await list_segments_for_contact(db, membership.organization_id, contact_id)
    items = []
    for segment in segments:
        rules = [SegmentRule(**r) for r in segment.rules]
        count = await count_matching_contacts(db, membership.organization_id, rules, segment.match_type)
        items.append(
            SegmentRead(
                id=segment.id, name=segment.name, rules=rules, match_type=segment.match_type,
                created_at=segment.created_at, contact_count=count,
            )
        )
    return items


async def _segment_read(db: AsyncSession, org_id: uuid.UUID, segment, usage: dict | None = None) -> SegmentRead:
    rules = [SegmentRule(**r) for r in segment.rules]
    reach = await segment_reach(db, org_id, rules, segment.match_type)
    usage = usage if usage is not None else await segment_usage(db, org_id)
    return SegmentRead(
        id=segment.id, name=segment.name, description=segment.description, rules=rules, match_type=segment.match_type,
        created_at=segment.created_at, updated_at=segment.updated_at, contact_count=reach["total"],
        reach=SegmentReach(**reach), used_in=usage.get(segment.id, 0),
        is_template=segment.is_template, deleted_at=segment.deleted_at,
    )


@segments_router.get("/meta")
async def segment_meta(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Everything the builder needs: fields (grouped), their operators, and pick-lists for the select-type fields."""
    from app.services import crm_sales_service, crm_service  # noqa: PLC0415
    from app.services.location_service import list_locations  # noqa: PLC0415
    from app.services.segment_rules import FIELDS, OPERATOR_LABELS, TYPE_OPS  # noqa: PLC0415

    org_id = membership.organization_id
    places = await list_locations(db, org_id)
    stages = await crm_service.list_stages(db, org_id)
    team = await crm_service.list_team(db, org_id)
    options = {
        "division": [p.name for p in places if p.kind == "division"], "district": [p.name for p in places if p.kind == "district"],
        "area": [p.name for p in places if p.kind == "area"], "customer_type": ["retail", "wholesale"],
        "source": [x["key"] for x in await crm_service.list_sources(db, org_id)], "stage": [{"value": str(s.id), "label": s.name} for s in stages],
        "owner": [{"value": str(t["user_id"]), "label": t["email"]} for t in team],
    }
    fields = [{"key": k, "label": v[0], "group": v[1], "type": v[2], "operators": TYPE_OPS[v[2]], "options": options.get(k)} for k, v in FIELDS.items()]
    for d in await crm_sales_service.list_custom_fields(db, org_id):
        numeric = d.field_type == "number"
        fields.append({"key": f"cf:{d.key}", "label": d.label, "group": "Your extra fields", "type": "custom", "subtype": d.field_type,
                       "operators": ["equals", "not_equals", "gt", "gte", "lt", "lte", "between", "is_set", "is_not_set"] if numeric
                       else ["equals", "not_equals", "contains", "in", "is_set", "is_not_set"], "options": d.options or None})
    return {"fields": fields, "operators": OPERATOR_LABELS}


@segments_router.get("/suggestions")
async def segment_suggestions(
    field: str,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Values that already exist in this company's contacts for a field, most common first — so the builder can
    offer them as one-click choices ("Dhaka · 3 people")."""
    from sqlalchemy import String, cast, literal_column, text  # noqa: PLC0415

    from app.services.segment_rules import FIELDS, field_type  # noqa: PLC0415

    org = membership.organization_id
    base = [Contact.organization_id == org, Contact.deleted_at.is_(None)]
    t = field_type(field)
    out: list[dict] = []
    hint = None

    def rows_to_values(rows) -> list[dict]:
        return [{"value": str(v), "label": str(v), "count": int(n)} for v, n in rows if v not in (None, "")]

    if t == "tags":
        tag = func.unnest(Contact.tags).label("tag")
        sub = select(tag).where(*base).subquery()
        rows = (await db.execute(select(sub.c.tag, func.count()).group_by(sub.c.tag).order_by(func.count().desc(), sub.c.tag).limit(30))).all()
        out = rows_to_values(rows)
    elif t == "custom":
        col = Contact.custom_fields[field[3:]].astext
        rows = (await db.execute(select(col, func.count()).where(*base, col.isnot(None)).group_by(col).order_by(func.count().desc()).limit(20))).all()
        out = rows_to_values(rows)
    elif field == "email":      # by provider: "@gmail.com"
        dom = func.lower(func.split_part(Contact.email, "@", 2))
        rows = (await db.execute(select(dom, func.count()).where(*base, Contact.email.isnot(None)).group_by(dom).order_by(func.count().desc()).limit(8))).all()
        out = [{"value": f"@{d}", "label": f"@{d}", "count": int(n)} for d, n in rows if d]
    elif field == "phone":      # by operator prefix: 017, 018 …
        pre = func.substr(Contact.phone, 1, 3)
        rows = (await db.execute(select(pre, func.count()).where(*base, Contact.phone.isnot(None)).group_by(pre).order_by(func.count().desc()).limit(8))).all()
        out = rows_to_values(rows)
    elif field in ("division", "district", "area", "source", "customer_type"):
        col = getattr(Contact, field)
        rows = (await db.execute(select(col, func.count()).where(*base, col.isnot(None)).group_by(col).order_by(func.count().desc(), col).limit(60))).all()
        out = rows_to_values(rows)
    elif field == "owner":
        from app.models.user import User  # noqa: PLC0415

        rows = (await db.execute(select(Contact.owner_user_id, User.email, func.count()).join(User, User.id == Contact.owner_user_id)
                                 .where(*base).group_by(Contact.owner_user_id, User.email).order_by(func.count().desc()))).all()
        out = [{"value": str(uid), "label": email, "count": int(n)} for uid, email, n in rows]
    elif field == "stage":
        from app.models.crm import PipelineStage  # noqa: PLC0415

        rows = (await db.execute(select(PipelineStage.id, PipelineStage.name, func.count(Contact.id))
                                 .outerjoin(Contact, and_(Contact.pipeline_stage_id == PipelineStage.id, *base))
                                 .where(PipelineStage.organization_id == org).group_by(PipelineStage.id, PipelineStage.name, PipelineStage.position)
                                 .order_by(PipelineStage.position))).all()
        out = [{"value": str(i), "label": n, "count": int(c)} for i, n, c in rows]
    elif t in ("text",) and field in ("first_name", "last_name", "company", "address"):
        col = getattr(Contact, field)
        rows = (await db.execute(select(col, func.count()).where(*base, col.isnot(None), col != "").group_by(col).order_by(func.count().desc(), col).limit(12))).all()
        out = rows_to_values(rows)
    elif field == "deal_value":
        lo, hi, n = (await db.execute(select(func.min(Contact.deal_value), func.max(Contact.deal_value), func.count(Contact.deal_value)).where(*base))).one()
        if n:
            hint = f"Your deals range from ৳{lo / 100:,.0f} to ৳{hi / 100:,.0f} ({n} contact{'s' if n != 1 else ''} with a deal value)."
    elif field in ("created_at", "last_contacted_at"):
        lo, hi = (await db.execute(select(func.min(getattr(Contact, field)), func.max(getattr(Contact, field))).where(*base))).one()
        if lo:
            hint = f"From {lo:%d %b %Y} to {hi:%d %b %Y}."
    return {"field": field, "values": out, "hint": hint}


@segments_router.post("/preview")
async def preview_segment(
    payload: SegmentPreviewRequest,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    reach = await segment_reach(db, membership.organization_id, payload.rules, payload.match_type)
    return {"count": reach["total"], "reach": reach}


@segments_router.post("/preview-contacts", response_model=list[ContactRead])
async def preview_segment_contacts(
    payload: SegmentPreviewRequest,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[ContactRead]:
    return await list_matching_contacts(
        db, membership.organization_id, payload.rules, limit=50, match_type=payload.match_type
    )


@segments_router.post("", response_model=SegmentRead, status_code=status.HTTP_201_CREATED)
async def create_segment_route(
    payload: SegmentCreate,
    as_template: bool = False,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SegmentRead:
    try:
        segment = await create_segment(db, membership.organization_id, payload.name, payload.rules, payload.match_type, payload.description,
                                       user_id=membership.user_id, is_template=as_template)
    except SegmentNameTakenError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"You already have a {'template' if as_template else 'segment'} called “{e}”.")
    return await _segment_read(db, membership.organization_id, segment)


@segments_router.get("/templates", response_model=list[SegmentRead])
async def list_templates_route(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SegmentRead]:
    """Quick-start templates. They are this company's own copies — edit, add or delete them like any segment."""
    templates = await list_templates(db, membership.organization_id)
    usage: dict = {}
    return [await _segment_read(db, membership.organization_id, t, usage) for t in templates]


@segments_router.post("/templates/restore-defaults")
async def restore_default_templates_route(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"added": await restore_default_templates(db, membership.organization_id)}


@segments_router.get("/trash", response_model=list[SegmentRead])
async def list_trash_route(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SegmentRead]:
    usage = await segment_usage(db, membership.organization_id)
    return [await _segment_read(db, membership.organization_id, s, usage) for s in await list_trashed_segments(db, membership.organization_id)]


@segments_router.put("/{segment_id}", response_model=SegmentRead)
async def update_segment_route(
    segment_id: uuid.UUID,
    payload: SegmentCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SegmentRead:
    try:
        segment = await update_segment(
            db, membership.organization_id, segment_id, payload.name, payload.rules, payload.match_type, payload.description,
            user_id=membership.user_id,
        )
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    except SegmentNameTakenError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"You already have one called “{e}”.")
    return await _segment_read(db, membership.organization_id, segment)


@segments_router.delete("/{segment_id}")
async def trash_segment_route(
    segment_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Moves it to the trash (restorable). Campaigns that already use it keep working."""
    try:
        used = await trash_segment(db, membership.organization_id, segment_id, membership.user_id)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    return {"trashed": True, "used_in": used}


@segments_router.post("/{segment_id}/restore", response_model=SegmentRead)
async def restore_segment_route(
    segment_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SegmentRead:
    try:
        segment = await restore_segment(db, membership.organization_id, segment_id, membership.user_id)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    return await _segment_read(db, membership.organization_id, segment)


@segments_router.delete("/{segment_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def purge_segment_route(
    segment_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await purge_segment(db, membership.organization_id, segment_id)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found in the trash")
    except SegmentInUseError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"It is still used by {e.used_in} campaign{'s' if e.used_in != 1 else ''}, so it can't be deleted for good. Restore it instead.",
        )


@segments_router.post("/{segment_id}/duplicate", response_model=SegmentRead, status_code=status.HTTP_201_CREATED)
async def duplicate_segment_route(
    segment_id: uuid.UUID,
    as_template: bool | None = None,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SegmentRead:
    """Copy a segment. `?as_template=true` saves it as a reusable template; `false` makes a live segment from a template."""
    try:
        segment = await duplicate_segment(db, membership.organization_id, segment_id, membership.user_id, as_template=as_template)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    return await _segment_read(db, membership.organization_id, segment)


@segments_router.get("/{segment_id}/history")
async def segment_history_route(
    segment_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    try:
        return await list_segment_history(db, membership.organization_id, segment_id)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")


@segments_router.post("/{segment_id}/history/{history_id}/restore", response_model=SegmentRead)
async def revert_segment_route(
    segment_id: uuid.UUID,
    history_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SegmentRead:
    try:
        segment = await revert_segment(db, membership.organization_id, segment_id, history_id, membership.user_id)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That change can't be undone")
    except SegmentNameTakenError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"You already have a segment called “{e}”.")
    return await _segment_read(db, membership.organization_id, segment)


@segments_router.get("", response_model=list[SegmentRead])
async def get_segments(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[SegmentRead]:
    segments = await list_segments(db, membership.organization_id)
    usage = await segment_usage(db, membership.organization_id)
    return [await _segment_read(db, membership.organization_id, s, usage) for s in segments]


@segments_router.get("/{segment_id}", response_model=SegmentRead)
async def get_segment_route(
    segment_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> SegmentRead:
    try:
        segment = await get_segment(db, membership.organization_id, segment_id)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    return await _segment_read(db, membership.organization_id, segment)


@segments_router.get("/{segment_id}/contacts", response_model=list[ContactRead])
async def get_segment_contacts_route(
    segment_id: uuid.UUID,
    limit: int = 500,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[ContactRead]:
    try:
        segment = await get_segment(db, membership.organization_id, segment_id)
    except SegmentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    rules = [SegmentRule(**r) for r in segment.rules]
    return await list_matching_contacts(db, membership.organization_id, rules, limit=min(max(limit, 1), 5000), match_type=segment.match_type)


@tag_presets_router.get("", response_model=list[TagPresetRead])
async def get_tag_presets(
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> list[TagPresetRead]:
    return await list_tag_presets(db, membership.organization_id)


@tag_presets_router.post("", response_model=TagPresetRead, status_code=status.HTTP_201_CREATED)
async def create_tag_preset_route(
    body: TagPresetCreate,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> TagPresetRead:
    try:
        return await create_tag_preset(db, membership.organization_id, body.name)
    except TagPresetExistsError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists")


@tag_presets_router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag_preset_route(
    preset_id: uuid.UUID,
    membership: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await delete_tag_preset(db, membership.organization_id, preset_id)
    except TagPresetNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag preset not found")
