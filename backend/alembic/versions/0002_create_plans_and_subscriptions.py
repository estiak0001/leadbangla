"""create plans and subscriptions tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-24

"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

PLAN_ROWS = [
    {
        "id": uuid.uuid4(),
        "code": "starter",
        "name": "Starter",
        "price_bdt": 1500,
        "billing_interval": "monthly",
        "is_active": True,
    },
    {
        "id": uuid.uuid4(),
        "code": "growth",
        "name": "Growth",
        "price_bdt": 4500,
        "billing_interval": "monthly",
        "is_active": True,
    },
    {
        "id": uuid.uuid4(),
        "code": "pro",
        "name": "Pro",
        "price_bdt": 9500,
        "billing_interval": "monthly",
        "is_active": True,
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM("pending", "active", "failed", "cancelled", name="subscription_status").create(
        bind, checkfirst=True
    )
    subscription_status_enum = postgresql.ENUM(
        "pending", "active", "failed", "cancelled", name="subscription_status", create_type=False
    )

    plans_table = op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("price_bdt", sa.Integer(), nullable=False),
        sa.Column("billing_interval", sa.String(length=20), nullable=False, server_default="monthly"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_plans_code", "plans", ["code"], unique=True)

    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("status", subscription_status_enum, nullable=False, server_default="pending"),
        sa.Column("tran_id", sa.String(length=64), nullable=False),
        sa.Column("gateway_val_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_subscriptions_tran_id", "subscriptions", ["tran_id"], unique=True)

    op.bulk_insert(plans_table, PLAN_ROWS)


def downgrade() -> None:
    op.drop_index("ix_subscriptions_tran_id", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_index("ix_plans_code", table_name="plans")
    op.drop_table("plans")
    postgresql.ENUM(name="subscription_status").drop(op.get_bind(), checkfirst=True)
