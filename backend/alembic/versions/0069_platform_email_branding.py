"""Platform email branding (logo/colors/footer) for internal transactional email

Revision ID: 0069
Revises: 0068
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_email_branding",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("brand_name", sa.String(length=100), nullable=False, server_default="LeadBangla"),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column("accent_color", sa.String(length=20), nullable=False, server_default="#4f46e5"),
        sa.Column("footer_html", sa.Text(), nullable=False, server_default="LeadBangla &middot; Dhaka, Bangladesh"),
        sa.Column("support_email", sa.String(length=255), nullable=True),
        sa.Column("updated_by", sa.String(length=255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.get_bind().execute(
        sa.text("insert into platform_email_branding (id) values (:id)"),
        {"id": uuid.uuid4()},
    )


def downgrade() -> None:
    op.drop_table("platform_email_branding")
