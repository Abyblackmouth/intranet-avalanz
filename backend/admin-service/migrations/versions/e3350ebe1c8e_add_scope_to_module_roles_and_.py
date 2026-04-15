"""add scope to module_roles and softdelete to global and submodule permissions
Revision ID: e3350ebe1c8e
Revises: d47aff39e7ad
Create Date: 2026-04-15 00:45:27.693451
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e3350ebe1c8e'
down_revision: Union[str, None] = 'd47aff39e7ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('global_permissions', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('global_permissions', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('module_roles', sa.Column('scope', sa.String(length=20), nullable=False, server_default='empresa'))
    op.alter_column('module_roles', 'module_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.add_column('submodule_permissions', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('submodule_permissions', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    op.drop_column('submodule_permissions', 'deleted_at')
    op.drop_column('submodule_permissions', 'is_deleted')
    op.alter_column('module_roles', 'module_id',
               existing_type=sa.UUID(),
               nullable=False)
    op.drop_column('module_roles', 'scope')
    op.drop_column('global_permissions', 'deleted_at')
    op.drop_column('global_permissions', 'is_deleted')
