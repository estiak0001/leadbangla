import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.organization import OrganizationMember
from app.services import merge_tag_service as svc

router = APIRouter(prefix="/merge-tags", tags=["campaigns"])


class MergeTagCreate(BaseModel):
    key: str = Field(min_length=1, max_length=50)
    value: str = Field(default="", max_length=2000)
    description: str | None = Field(default=None, max_length=200)


class MergeTagUpdate(BaseModel):
    value: str | None = Field(default=None, max_length=2000)
    description: str | None = Field(default=None, max_length=200)


class MergeTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    value: str
    description: str | None
    builtin: bool = False
    updated_at: datetime

    @classmethod
    def of(cls, tag) -> "MergeTagRead":
        out = cls.model_validate(tag)
        out.builtin = tag.key in svc.BUILTIN_KEYS
        return out


@router.get("", response_model=list[MergeTagRead])
async def list_tags(m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    return [MergeTagRead.of(t) for t in await svc.list_merge_tags(db, m.organization_id)]


@router.post("", response_model=MergeTagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(body: MergeTagCreate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return MergeTagRead.of(await svc.create_merge_tag(db, m.organization_id, body.key, body.value, body.description))
    except svc.MergeTagInvalidKeyError:
        raise HTTPException(status_code=400, detail="Tag name must start with a letter and use only a-z, 0-9 and _ (max 40).")
    except svc.MergeTagReservedError:
        raise HTTPException(status_code=400, detail="This name is a built-in contact tag and can't be used. Choose another name.")
    except svc.MergeTagExistsError:
        raise HTTPException(status_code=409, detail="A tag with this name already exists")


@router.patch("/{tag_id}", response_model=MergeTagRead)
async def update_tag(tag_id: uuid.UUID, body: MergeTagUpdate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        return MergeTagRead.of(await svc.update_merge_tag(db, m.organization_id, tag_id, body.model_dump(exclude_unset=True)))
    except svc.MergeTagNotFoundError:
        raise HTTPException(status_code=404, detail="Tag not found")


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    try:
        await svc.delete_merge_tag(db, m.organization_id, tag_id)
    except svc.MergeTagNotFoundError:
        raise HTTPException(status_code=404, detail="Tag not found")
