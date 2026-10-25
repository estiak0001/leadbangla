"""create wallet tables

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-02

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_wallets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("balance_paisa", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("low_balance_threshold_paisa", sa.BigInteger(), nullable=False, server_default="5000"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "wallet_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("amount_paisa", sa.BigInteger(), nullable=False),
        sa.Column("balance_after_paisa", sa.BigInteger(), nullable=False),
        sa.Column("service", sa.String(30), nullable=True),
        sa.Column("units_consumed", sa.Integer(), nullable=True),
        sa.Column("reference_id", sa.String(128), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), index=True),
    )

    # Pending top-up intents, created before the tenant is redirected to
    # checkout — resolved by tran_id in the IPN/fake-checkout callback so we
    # never have to encode organization_id into the tran_id string itself
    # (mirrors how `subscriptions.tran_id` already works for plan checkout).
    op.create_table(
        "wallet_topups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("amount_paisa", sa.BigInteger(), nullable=False),
        sa.Column("tran_id", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("wallet_topups")
    op.drop_table("wallet_transactions")
    op.drop_table("org_wallets")
