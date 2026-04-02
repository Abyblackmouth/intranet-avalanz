"""add matricula puesto departamento to users

Revision ID: 56a1e78b4518
Revises: 152e0764c443
Create Date: 2026-04-02 01:35:53.230990

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '56a1e78b4518'
down_revision: Union[str, None] = '152e0764c443'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('users', sa.Column('matricula', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('puesto', sa.String(150), nullable=True))
    op.add_column('users', sa.Column('departamento', sa.String(150), nullable=True))
    op.create_index('ix_users_matricula', 'users', ['matricula'], unique=True)

def downgrade() -> None:
    op.drop_index('ix_users_matricula', table_name='users')
    op.drop_column('users', 'matricula')
    op.drop_column('users', 'puesto')
    op.drop_column('users', 'departamento')
