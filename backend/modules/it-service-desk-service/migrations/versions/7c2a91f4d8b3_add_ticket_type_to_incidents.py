"""add ticket_type to incidents

Revision ID: 7c2a91f4d8b3
Revises: 1ae5444f3133
Create Date: 2026-09-25 02:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c2a91f4d8b3'
down_revision: Union[str, None] = '1ae5444f3133'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clasifica cada ticket: incidente (lo que ya existe), control_cambio
    # o solicitud_acceso (nuevos tipos, aun sin flujo propio construido).
    # server_default asegura que los 45+ registros existentes queden
    # marcados como 'incidente' de inmediato, sin dejar nulos.
    op.add_column(
        'incidents',
        sa.Column('ticket_type', sa.String(20), nullable=False, server_default='incidente'),
    )


def downgrade() -> None:
    op.drop_column('incidents', 'ticket_type')
