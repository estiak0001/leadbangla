import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_membership
from app.models.message_template import MessageTemplate
from app.models.organization import OrganizationMember

router = APIRouter(prefix="/message-templates", tags=["sms"])

Channel = Literal["sms", "whatsapp"]


class TemplateCreate(BaseModel):
    channel: Channel
    name: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=1600)
    approved: bool = False


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    body: str | None = Field(default=None, min_length=1, max_length=1600)
    approved: bool | None = None


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    channel: str
    name: str
    body: str
    approved: bool
    updated_at: datetime


async def _get(db: AsyncSession, org_id: uuid.UUID, template_id: uuid.UUID) -> MessageTemplate:
    t = await db.scalar(select(MessageTemplate).where(MessageTemplate.organization_id == org_id, MessageTemplate.id == template_id))
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@router.get("", response_model=list[TemplateRead])
async def list_templates(
    channel: Channel | None = Query(default=None),
    m: OrganizationMember = Depends(get_current_membership),
    db: AsyncSession = Depends(get_db),
):
    q = select(MessageTemplate).where(MessageTemplate.organization_id == m.organization_id).order_by(MessageTemplate.name)
    if channel:
        q = q.where(MessageTemplate.channel == channel)
    return list(await db.scalars(q))


@router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(body: TemplateCreate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    t = MessageTemplate(organization_id=m.organization_id, **body.model_dump())
    if t.channel == "sms":
        t.approved = False  # approval only applies to WhatsApp
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.patch("/{template_id}", response_model=TemplateRead)
async def update_template(template_id: uuid.UUID, body: TemplateUpdate, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    t = await _get(db, m.organization_id, template_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None and not (k == "approved" and t.channel == "sms"):
            setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: uuid.UUID, m: OrganizationMember = Depends(get_current_membership), db: AsyncSession = Depends(get_db)):
    await db.delete(await _get(db, m.organization_id, template_id))
    await db.commit()
