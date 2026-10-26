import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.merge_tag import MergeTag

KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
BUILTIN_KEYS = ("first_name", "last_name", "email", "phone", "unsubscribe_url")


class MergeTagNotFoundError(Exception):
    pass


class MergeTagExistsError(Exception):
    pass


class MergeTagInvalidKeyError(Exception):
    pass


class MergeTagReservedError(Exception):
    """The name belongs to a built-in contact tag and can't be redefined."""


async def list_merge_tags(db: AsyncSession, org_id: uuid.UUID) -> list[MergeTag]:
    result = await db.scalars(
        select(MergeTag).where(MergeTag.organization_id == org_id, MergeTag.key.notin_(BUILTIN_KEYS)).order_by(MergeTag.key)
    )
    return list(result)


async def merge_tag_values(db: AsyncSession, org_id: uuid.UUID) -> dict[str, str]:
    return {t.key: t.value for t in await list_merge_tags(db, org_id) if t.key not in BUILTIN_KEYS}


async def create_merge_tag(db: AsyncSession, org_id: uuid.UUID, key: str, value: str, description: str | None) -> MergeTag:
    key = key.strip().lower().removeprefix("{{").removesuffix("}}").strip()
    if not KEY_RE.match(key):
        raise MergeTagInvalidKeyError(key)
    if key in BUILTIN_KEYS:
        raise MergeTagReservedError(key)
    if await db.scalar(select(MergeTag).where(MergeTag.organization_id == org_id, MergeTag.key == key)):
        raise MergeTagExistsError(key)
    tag = MergeTag(organization_id=org_id, key=key, value=value, description=(description or None))
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


async def _get(db: AsyncSession, org_id: uuid.UUID, tag_id: uuid.UUID) -> MergeTag:
    tag = await db.scalar(select(MergeTag).where(MergeTag.organization_id == org_id, MergeTag.id == tag_id))
    if tag is None:
        raise MergeTagNotFoundError(tag_id)
    return tag


async def update_merge_tag(db: AsyncSession, org_id: uuid.UUID, tag_id: uuid.UUID, data: dict) -> MergeTag:
    tag = await _get(db, org_id, tag_id)
    for field in ("value", "description"):
        if field in data:
            setattr(tag, field, data[field] if field == "value" else (data[field] or None))
    await db.commit()
    await db.refresh(tag)
    return tag


async def delete_merge_tag(db: AsyncSession, org_id: uuid.UUID, tag_id: uuid.UUID) -> None:
    await db.delete(await _get(db, org_id, tag_id))
    await db.commit()
