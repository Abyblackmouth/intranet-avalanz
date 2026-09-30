"""add CDC statuses to incident_status_enum

Revision ID: a91f3d2e7c48
Revises: fcd35a61ecfe
Create Date: 2026-09-25 03:45:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a91f3d2e7c48'
down_revision: Union[str, None] = 'fcd35a61ecfe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NUEVOS_ESTATUS = [
    "registrado", "en_revision", "aprobado", "rechazado", "priorizado",
    "en_desarrollo", "en_pruebas", "terminado", "cancelado",
]


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE no puede correr dentro de una transaccion
    # abierta en Postgres -- se cierra la que Alembic abre por defecto
    # antes de aplicar cada valor nuevo.
    op.execute("COMMIT")
    for valor in NUEVOS_ESTATUS:
        op.execute(f"ALTER TYPE incident_status_enum ADD VALUE IF NOT EXISTS '{valor}'")


def downgrade() -> None:
    # Postgres no soporta quitar valores de un enum directamente.
    # Si hace falta revertir, se requeriria recrear el tipo completo
    # (fuera de alcance de un downgrade automatico simple).
    pass
