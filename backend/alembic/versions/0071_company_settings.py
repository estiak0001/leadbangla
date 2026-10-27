"""Company settings (name/logo/address/contact) as the single source for email
branding; trims the now-duplicate brand_name/logo_url/footer_html/support_email
columns off platform_email_branding.

Revision ID: 0071
Revises: 0070
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_company_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_name", sa.String(length=150), nullable=False, server_default="LeadBangla"),
        sa.Column("legal_name", sa.String(length=200), nullable=True),
        sa.Column("address", sa.String(length=300), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True, server_default="Bangladesh"),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("support_email", sa.String(length=255), nullable=True),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("logo_data", sa.LargeBinary(), nullable=True),
        sa.Column("logo_content_type", sa.String(length=100), nullable=True),
        sa.Column("updated_by", sa.String(length=255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    conn = op.get_bind()
    existing = conn.execute(sa.text("select brand_name, support_email from platform_email_branding limit 1")).first()
    company_name = (existing[0] if existing and existing[0] else "LeadBangla")
    support_email = existing[1] if existing else None
    conn.execute(
        sa.text(
            "insert into platform_company_settings (id, company_name, support_email, website) "
            "values (:id, :name, :support_email, 'https://leadbangla.com')"
        ),
        {"id": uuid.uuid4(), "name": company_name, "support_email": support_email},
    )

    for col in ("brand_name", "logo_url", "footer_html", "support_email"):
        op.drop_column("platform_email_branding", col)


def downgrade() -> None:
    op.add_column("platform_email_branding", sa.Column("brand_name", sa.String(length=100), nullable=False, server_default="LeadBangla"))
    op.add_column("platform_email_branding", sa.Column("logo_url", sa.String(length=500), nullable=True))
    op.add_column("platform_email_branding", sa.Column("footer_html", sa.Text(), nullable=False, server_default="LeadBangla &middot; Dhaka, Bangladesh"))
    op.add_column("platform_email_branding", sa.Column("support_email", sa.String(length=255), nullable=True))
    op.drop_table("platform_company_settings")
