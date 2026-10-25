"""create CRM tables

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-01

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pipeline_stages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("color", sa.String(20), nullable=False, server_default="'#6B7280'"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_pipeline_stages_organization_id", "pipeline_stages", ["organization_id"])

    op.create_table(
        "contact_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_contact_notes_organization_id", "contact_notes", ["organization_id"])
    op.create_index("ix_contact_notes_contact_id", "contact_notes", ["contact_id"])

    op.add_column(
        "contacts",
        sa.Column("pipeline_stage_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_contacts_pipeline_stage_id",
        "contacts",
        "pipeline_stages",
        ["pipeline_stage_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_contacts_pipeline_stage_id", "contacts", type_="foreignkey")
    op.drop_column("contacts", "pipeline_stage_id")
    op.drop_index("ix_contact_notes_contact_id", table_name="contact_notes")
    op.drop_index("ix_contact_notes_organization_id", table_name="contact_notes")
    op.drop_table("contact_notes")
    op.drop_index("ix_pipeline_stages_organization_id", table_name="pipeline_stages")
    op.drop_table("pipeline_stages")
