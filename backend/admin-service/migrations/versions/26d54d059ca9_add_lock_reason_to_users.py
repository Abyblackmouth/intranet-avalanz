"""add lock_reason to users

Revision ID: 26d54d059ca9
Revises: 56a1e78b4518
Create Date: 2026-04-03 02:46:03.936713
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '26d54d059ca9'
down_revision: Union[str, None] = '56a1e78b4518'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('users', sa.Column('lock_reason', sa.String(length=255), nullable=True))

def downgrade() -> None:
    op.drop_column('users', 'lock_reason')
