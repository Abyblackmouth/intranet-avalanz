"""add envelope_signers table

Revision ID: 2c4cbf7f7b31
Revises: a7d79d465637
Create Date: 2026-06-19

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '2c4cbf7f7b31'
down_revision: Union[str, None] = 'a7d79d465637'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'envelope_signers',
        sa.Column('id',                    UUID(as_uuid=False), primary_key=True),
        sa.Column('envelope_id',           UUID(as_uuid=False), sa.ForeignKey('envelopes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('signer_type',           sa.String(20),  nullable=False),
        sa.Column('user_id',               UUID(as_uuid=False), nullable=True),
        sa.Column('name',                  sa.String(255), nullable=False),
        sa.Column('email',                 sa.String(255), nullable=False),
        sa.Column('role_in_document',      sa.String(100), nullable=True),
        sa.Column('routing_order',         sa.Integer(),   nullable=False, server_default='1'),
        sa.Column('docusign_recipient_id', sa.String(100), nullable=True),
        sa.Column('status',                sa.String(30),  nullable=False, server_default='pending'),
        sa.Column('signed_at',             sa.DateTime(timezone=True), nullable=True),
        sa.Column('declined_at',           sa.DateTime(timezone=True), nullable=True),
        sa.Column('declined_reason',       sa.Text(),      nullable=True),
        sa.Column('docs_requested',        sa.JSON(),      nullable=True),
        sa.Column('docs_received',         sa.JSON(),      nullable=True),
        sa.Column('created_at',            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_envelope_signers_envelope_id', 'envelope_signers', ['envelope_id'])
    op.create_index('ix_envelope_signers_email',       'envelope_signers', ['email'])
    op.create_index('ix_envelope_signers_status',      'envelope_signers', ['status'])


def downgrade() -> None:
    op.drop_index('ix_envelope_signers_status',      table_name='envelope_signers')
    op.drop_index('ix_envelope_signers_email',       table_name='envelope_signers')
    op.drop_index('ix_envelope_signers_envelope_id', table_name='envelope_signers')
    op.drop_table('envelope_signers')
