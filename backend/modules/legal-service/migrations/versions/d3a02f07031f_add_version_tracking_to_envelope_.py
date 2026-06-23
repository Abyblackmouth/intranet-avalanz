"""add version tracking to envelope attachments

Revision ID: d3a02f07031f
Revises: a62f97aa714d
Create Date: 2026-06-23

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'd3a02f07031f'
down_revision: Union[str, None] = 'a62f97aa714d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('envelope_attachments', sa.Column('version_number', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('envelope_attachments', sa.Column('is_current', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('envelope_attachments', sa.Column('document_type', sa.String(50), nullable=True))
    op.add_column('envelope_attachments', sa.Column('replaced_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('envelope_attachments', sa.Column('replaced_by_user_id', UUID(as_uuid=False), nullable=True))
    op.add_column('envelope_attachments', sa.Column('replaced_by_name', sa.String(255), nullable=True))
    op.add_column('envelope_attachments', sa.Column('replaced_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('envelope_attachments', 'replaced_reason')
    op.drop_column('envelope_attachments', 'replaced_by_name')
    op.drop_column('envelope_attachments', 'replaced_by_user_id')
    op.drop_column('envelope_attachments', 'replaced_at')
    op.drop_column('envelope_attachments', 'document_type')
    op.drop_column('envelope_attachments', 'is_current')
    op.drop_column('envelope_attachments', 'version_number')
