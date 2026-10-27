"""Admin-editable templates for each kind of internal transactional email

Revision ID: 0070
Revises: 0069
"""
import sqlalchemy as sa
from alembic import op

revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_email_templates",
        sa.Column("key", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("updated_by", sa.String(length=255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Rows are also lazily seeded on first read (app/services/email_template_service.py),
    # but seeding here means they show up in the admin list immediately after deploy.
    from app.services.email_template_service import DEFAULTS  # noqa: PLC0415

    conn = op.get_bind()
    table = sa.table(
        "platform_email_templates",
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("subject", sa.String),
        sa.column("body_html", sa.Text),
    )
    conn.execute(
        table.insert(),
        [{"key": k, "name": v["name"], "subject": v["subject"], "body_html": v["body_html"]} for k, v in DEFAULTS.items()],
    )


def downgrade() -> None:
    op.drop_table("platform_email_templates")
