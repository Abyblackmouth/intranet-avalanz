"""add address and constancia fields to companies

Revision ID: 951e0445379d
Revises: 26d54d059ca9
Create Date: 2026-04-05 05:00:16.823694

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '951e0445379d'
down_revision: Union[str, None] = '26d54d059ca9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('calle', sa.String(length=255), nullable=True))
    op.add_column('companies', sa.Column('num_ext', sa.String(length=20), nullable=True))
    op.add_column('companies', sa.Column('num_int', sa.String(length=20), nullable=True))
    op.add_column('companies', sa.Column('colonia', sa.String(length=150), nullable=True))
    op.add_column('companies', sa.Column('cp', sa.String(length=10), nullable=True))
    op.add_column('companies', sa.Column('municipio', sa.String(length=150), nullable=True))
    op.add_column('companies', sa.Column('estado', sa.String(length=100), nullable=True))
    op.add_column('companies', sa.Column('constancia_fecha_emision', sa.String(length=50), nullable=True))
    op.add_column('companies', sa.Column('constancia_fecha_vigencia', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('companies', 'constancia_fecha_vigencia')
    op.drop_column('companies', 'constancia_fecha_emision')
    op.drop_column('companies', 'estado')
    op.drop_column('companies', 'municipio')
    op.drop_column('companies', 'cp')
    op.drop_column('companies', 'colonia')
    op.drop_column('companies', 'num_int')
    op.drop_column('companies', 'num_ext')
    op.drop_column('companies', 'calle')
