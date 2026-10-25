"""Shared inbox: receiving domains, addresses, threads, messages; campaign reply-to

Revision ID: 0064
Revises: 0063
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
now = sa.func.now()


def upgrade() -> None:
    op.create_table(
        "inbox_domains",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sending_domain_id", UUID, sa.ForeignKey("sending_domains.id", ondelete="CASCADE"), nullable=False),
        sa.Column("receive_domain", sa.String(255), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),   # pending | active | disabled
        sa.Column("mx_value", sa.String(300), nullable=False),
        sa.Column("catch_all", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("dns_submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_inbox_domains_organization_id", "inbox_domains", ["organization_id"])

    op.create_table(
        "inbox_addresses",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inbox_domain_id", UUID, sa.ForeignKey("inbox_domains.id", ondelete="CASCADE"), nullable=False),
        sa.Column("local_part", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.UniqueConstraint("inbox_domain_id", "local_part", name="uq_inbox_address_local"),
    )
    op.create_index("ix_inbox_addresses_organization_id", "inbox_addresses", ["organization_id"])

    op.create_table(
        "mail_threads",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("address_id", UUID, sa.ForeignKey("inbox_addresses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject", sa.String(500), nullable=False, server_default=""),
        sa.Column("snippet_enc", sa.Text(), nullable=True),
        sa.Column("folder", sa.String(12), nullable=False, server_default="inbox"),   # inbox | sent | archive | spam | trash
        sa.Column("starred", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("unread_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("has_outgoing", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("participants", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("contact_id", UUID, sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_to_user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index("ix_mail_threads_org_folder_last", "mail_threads", ["organization_id", "folder", "last_message_at"])

    op.create_table(
        "mail_messages",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("thread_id", UUID, sa.ForeignKey("mail_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False),                          # in | out
        sa.Column("message_id_header", sa.String(500), nullable=True),
        sa.Column("in_reply_to", sa.String(500), nullable=True),
        sa.Column("references_hdr", sa.Text(), nullable=True),
        sa.Column("from_email", sa.String(320), nullable=False, server_default=""),
        sa.Column("from_name", sa.String(300), nullable=True),
        sa.Column("to_json", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("cc_json", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("subject", sa.String(500), nullable=False, server_default=""),
        sa.Column("text_enc", sa.Text(), nullable=True),
        sa.Column("html_enc", sa.Text(), nullable=True),
        sa.Column("snippet_enc", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column("raw_key", sa.String(600), nullable=True),
        sa.Column("spam_verdict", sa.String(12), nullable=True),
        sa.Column("virus_verdict", sa.String(12), nullable=True),
        sa.Column("spf_verdict", sa.String(12), nullable=True),
        sa.Column("dkim_verdict", sa.String(12), nullable=True),
        sa.Column("dmarc_verdict", sa.String(12), nullable=True),
        sa.Column("auto_generated", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("status", sa.String(10), nullable=False, server_default="received"),   # received | sent | failed
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("sent_by_user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_mail_messages_thread_id", "mail_messages", ["thread_id"])
    op.create_index("ix_mail_messages_org_received", "mail_messages", ["organization_id", "received_at"])
    # the same message is only filed once per customer (SES can deliver twice)
    op.create_index("uq_mail_messages_org_msgid", "mail_messages", ["organization_id", "message_id_header"], unique=True,
                    postgresql_where=sa.text("message_id_header IS NOT NULL"))

    op.create_table(
        "mail_attachments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("message_id", UUID, sa.ForeignKey("mail_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(300), nullable=False),
        sa.Column("content_type", sa.String(150), nullable=False, server_default="application/octet-stream"),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("data", sa.LargeBinary(), nullable=True),     # only for mail we sent; received files stay in the raw message
    )
    op.create_index("ix_mail_attachments_message_id", "mail_attachments", ["message_id"])

    op.create_table(
        "mail_uploads",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(300), nullable=False),
        sa.Column("content_type", sa.String(150), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=now),
    )

    op.add_column("campaigns", sa.Column("reply_to", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("campaigns", "reply_to")
    for t in ("mail_uploads", "mail_attachments", "mail_messages", "mail_threads", "inbox_addresses", "inbox_domains"):
        op.drop_table(t)
