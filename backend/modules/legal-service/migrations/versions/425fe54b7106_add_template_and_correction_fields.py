"""add template and correction fields

Revision ID: 425fe54b7106
Revises: a3208a4d12c7
Create Date: 2026-06-19

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '425fe54b7106'
down_revision: Union[str, None] = 'a3208a4d12c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # contract_types — referencia al template
    op.add_column('contract_types', sa.Column('template_slug',    sa.String(100), nullable=True))
    op.add_column('contract_types', sa.Column('template_version', sa.String(20),  nullable=True, server_default='1.0'))

    # contract_type_attachment_defs — tipos de archivo permitidos
    op.add_column('contract_type_attachment_defs', sa.Column('allowed_mime_types', sa.JSON(), nullable=True))

    # envelopes — checklist de correcciones
    op.add_column('envelopes', sa.Column('correction_checklist', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('envelopes',                      'correction_checklist')
    op.drop_column('contract_type_attachment_defs',  'allowed_mime_types')
    op.drop_column('contract_types',                 'template_version')
    op.drop_column('contract_types',                 'template_slug')
