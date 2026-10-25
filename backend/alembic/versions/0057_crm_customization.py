"""CRM customization: stage probability / stale days / auto task, lost reasons, lead sources, board prefs

Revision ID: 0057
Revises: 0056
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pipeline_stages", sa.Column("probability", sa.Integer(), nullable=True))
    op.add_column("pipeline_stages", sa.Column("stale_days", sa.Integer(), nullable=True))
    op.add_column("pipeline_stages", sa.Column("auto_task_days", sa.Integer(), nullable=True))
    op.add_column("pipeline_stages", sa.Column("auto_task_title", sa.String(200), nullable=True))
    op.add_column("crm_settings", sa.Column("lost_reasons", postgresql.JSONB(), nullable=True))
    op.add_column("crm_settings", sa.Column("sources", postgresql.JSONB(), nullable=True))
    op.add_column("crm_settings", sa.Column("board_prefs", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    for c in ("board_prefs", "sources", "lost_reasons"):
        op.drop_column("crm_settings", c)
    for c in ("auto_task_title", "auto_task_days", "stale_days", "probability"):
        op.drop_column("pipeline_stages", c)
