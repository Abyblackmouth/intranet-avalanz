"""add photo fields to users

Revision ID: 994caa5986c9
Revises: e1642a0e0227
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '994caa5986c9'
down_revision: Union[str, None] = 'e1642a0e0227'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTA: este archivo se reconstruyó retroactivamente. Las columnas ya
    # existían en la base de datos real (aplicadas junto con el fix de
    # cambio de foto de perfil) pero el archivo de migración nunca se
    # comiteó a git. Este archivo documenta ese cambio para que la cadena
    # de Alembic sea consistente; no se re-ejecuta contra esta base de
    # datos porque alembic_version ya está en '994caa5986c9'.
    op.add_column('users', sa.Column('photo_object_key', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('photo_updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'photo_updated_at')
    op.drop_column('users', 'photo_object_key')
