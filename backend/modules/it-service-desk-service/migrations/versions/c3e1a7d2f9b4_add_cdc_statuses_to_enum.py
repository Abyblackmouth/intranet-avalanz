"""add cdc lifecycle statuses to incident_status_enum

Revision ID: c3e1a7d2f9b4
Revises: b9f145fc7fb8
Create Date: 2026-09-29

El autogenerate de Alembic no detecta cambios en ENUMs de PostgreSQL, por
eso esta migracion es manual. Agrega de una vez todos los estatus del ciclo
de Control de Cambios que faltaban, para no toparse con esto en cada etapa.
"""
from alembic import op

revision = "c3e1a7d2f9b4"
down_revision = "b9f145fc7fb8"
branch_labels = None
depends_on = None

NUEVOS = ["en_arranque", "en_desarrollo", "en_pruebas", "terminado", "cancelado"]


def upgrade() -> None:
    for valor in NUEVOS:
        op.execute(f"ALTER TYPE incident_status_enum ADD VALUE IF NOT EXISTS '{valor}'")


def downgrade() -> None:
    # PostgreSQL no permite quitar valores de un ENUM sin recrear el tipo;
    # quedan registrados sin afectar a nadie que no los use.
    pass
