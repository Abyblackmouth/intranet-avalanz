"""add intercompany fields to envelopes

Revision ID: a3208a4d12c7
Revises: 2c4cbf7f7b31
Create Date: 2026-06-19

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'a3208a4d12c7'
down_revision: Union[str, None] = '2c4cbf7f7b31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('envelopes', sa.Column('is_intercompany', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('envelopes', sa.Column('counterparty_company_id', UUID(as_uuid=False), nullable=True))
    op.create_index('ix_envelopes_is_intercompany', 'envelopes', ['is_intercompany'])
    op.create_index('ix_envelopes_counterparty_company_id', 'envelopes', ['counterparty_company_id'])


def downgrade() -> None:
    op.drop_index('ix_envelopes_counterparty_company_id', table_name='envelopes')
    op.drop_index('ix_envelopes_is_intercompany', table_name='envelopes')
    op.drop_column('envelopes', 'counterparty_company_id')
    op.drop_column('envelopes', 'is_intercompany')
