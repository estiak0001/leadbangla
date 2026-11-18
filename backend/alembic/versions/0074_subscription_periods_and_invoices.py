"""Billing periods on subscriptions, an invoices table, and an EXPIRED status.

Backfills every currently-ACTIVE subscription with a period starting *now* (not
its original purchase date, so nobody becomes retroactively overdue) and a
matching "paid" invoice for continuity of invoice history.

Revision ID: 0074
Revises: 0073
"""
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


def _add_months(dt: datetime, months: int) -> datetime:
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                        31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return dt.replace(year=year, month=month, day=day)


def _period_end(start: datetime, billing_interval: str) -> datetime:
    if billing_interval == "yearly":
        return _add_months(start, 12)
    return _add_months(start, 1)  # "monthly" and any unrecognised interval default to 1 month


def upgrade() -> None:
    op.execute("ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'expired'")

    op.add_column("subscriptions", sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscriptions", sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "invoice_counters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("last_number", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscriptions.id"), nullable=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("invoice_number", sa.String(length=40), nullable=False),
        sa.Column("amount_bdt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="due"),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_method", sa.String(length=20), nullable=True),
        sa.Column("payment_reference", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_invoices_subscription_period", "invoices", ["subscription_id", "period_start"])
    op.create_unique_constraint("uq_invoices_invoice_number", "invoices", ["invoice_number"])

    conn = op.get_bind()
    conn.execute(sa.text("insert into invoice_counters (id, last_number) values (:id, 0)"), {"id": uuid.uuid4()})

    now = datetime.now(timezone.utc)
    rows = conn.execute(sa.text(
        "select s.id, s.organization_id, s.plan_id, p.billing_interval, p.price_bdt "
        "from subscriptions s join plans p on p.id = s.plan_id "
        "where s.status = 'active' and s.organization_id is not null"
    )).fetchall()

    counter_id = conn.execute(sa.text("select id from invoice_counters limit 1")).scalar()
    n = 0
    for sub_id, org_id, plan_id, billing_interval, price_bdt in rows:
        period_end = _period_end(now, billing_interval or "monthly")
        conn.execute(
            sa.text("update subscriptions set current_period_start = :start, current_period_end = :end where id = :id"),
            {"start": now, "end": period_end, "id": sub_id},
        )
        n += 1
        conn.execute(
            sa.text(
                "insert into invoices (id, organization_id, subscription_id, plan_id, invoice_number, amount_bdt, "
                "status, period_start, period_end, issued_at, paid_at, payment_method, payment_reference, created_at) "
                "values (:id, :org_id, :sub_id, :plan_id, :inv_no, :amount, 'paid', :start, :end, :now, :now, "
                "'migration_backfill', 'migration_backfill', :now)"
            ),
            {
                "id": uuid.uuid4(), "org_id": org_id, "sub_id": sub_id, "plan_id": plan_id,
                "inv_no": f"INV-{now.year}-{n:06d}", "amount": price_bdt, "start": now, "end": period_end, "now": now,
            },
        )
    conn.execute(sa.text("update invoice_counters set last_number = :n where id = :id"), {"n": n, "id": counter_id})


def downgrade() -> None:
    op.drop_table("invoices")
    op.drop_table("invoice_counters")
    op.drop_column("subscriptions", "current_period_end")
    op.drop_column("subscriptions", "current_period_start")
    # Postgres has no DROP VALUE for enums; leaving 'expired' in subscription_status is harmless.
