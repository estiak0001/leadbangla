"""CRM features: contact sales fields, stage outcome, tasks, activities, custom fields, consent log, dues, settings

Revision ID: 0047
Revises: 0046
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enum additions must run outside a transaction block on older PG; use autocommit block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE workflowtriggertype ADD VALUE IF NOT EXISTS 'stage_entered'")
        op.execute("ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'sales'")

    op.add_column("contacts", sa.Column("company", sa.String(200), nullable=True))
    op.add_column("contacts", sa.Column("address", sa.String(500), nullable=True))
    op.add_column("contacts", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("source", sa.String(60), nullable=True))
    op.add_column("contacts", sa.Column("whatsapp_number", sa.String(32), nullable=True))
    op.add_column("contacts", sa.Column("facebook_url", sa.String(300), nullable=True))
    op.add_column("contacts", sa.Column("customer_type", sa.String(20), nullable=True))
    op.add_column("contacts", sa.Column("last_contacted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contacts", sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("contacts", sa.Column("deal_value", sa.BigInteger(), nullable=True))  # paisa
    op.add_column("contacts", sa.Column("expected_close_date", sa.Date(), nullable=True))
    op.add_column("contacts", sa.Column("lost_reason", sa.String(300), nullable=True))
    op.add_column("contacts", sa.Column("stage_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contacts", sa.Column("custom_fields", postgresql.JSONB(), nullable=False, server_default="{}"))
    op.create_index("ix_contacts_owner_user_id", "contacts", ["owner_user_id"])
    op.create_index("ix_contacts_source", "contacts", ["source"])

    op.add_column("pipeline_stages", sa.Column("outcome", sa.String(10), nullable=False, server_default="open"))

    op.create_table(
        "crm_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False, index=True),
        sa.Column("assignee_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="follow_up"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "crm_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False),  # stage_change|call|visit|meeting|owner_change|task_done
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )
    op.create_table(
        "custom_field_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("key", sa.String(60), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False, server_default="text"),  # text|number|date|select
        sa.Column("options", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("organization_id", "key", name="uq_custom_field_org_key"),
    )
    op.create_table(
        "consent_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False, index=True),
        sa.Column("channel", sa.String(20), nullable=False),  # sms|whatsapp
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("method", sa.String(40), nullable=False),  # manual|import|form|api
        sa.Column("recorded_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )
    op.create_table(
        "crm_dues",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(10), nullable=False),  # due (customer owes) | payment
        sa.Column("amount", sa.BigInteger(), nullable=False),  # paisa
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "crm_settings",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), primary_key=True),
        sa.Column("round_robin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_assigned_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_reminders", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    for t in ["crm_settings", "crm_dues", "consent_log", "custom_field_definitions", "crm_activities", "crm_tasks"]:
        op.drop_table(t)
    op.drop_column("pipeline_stages", "outcome")
    op.drop_index("ix_contacts_source", "contacts")
    op.drop_index("ix_contacts_owner_user_id", "contacts")
    for c in ["custom_fields", "stage_changed_at", "lost_reason", "expected_close_date", "deal_value", "owner_user_id",
              "last_contacted_at", "customer_type", "facebook_url", "whatsapp_number", "source", "city", "address", "company"]:
        op.drop_column("contacts", c)
