"""add incident_comments

Conversacion del ticket: comentarios publicos y notas internas de TI.

Revision ID: b8d2e4f6a1c3
Revises: a7c1d2e3f4b5
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b8d2e4f6a1c3"
down_revision = "a7c1d2e3f4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incident_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_name", sa.String(200), nullable=False),
        sa.Column("author_rol", sa.String(20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("pide_respuesta", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("attachments", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_incident_comments_incident", "incident_comments", ["incident_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_incident_comments_incident", table_name="incident_comments")
    op.drop_table("incident_comments")
