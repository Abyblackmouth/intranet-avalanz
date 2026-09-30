"""add en_paso_produccion status

Revision ID: e5a3c9d7b2f1
Revises: aa6f45a22bb9
Create Date: 2026-09-30

Manual: el autogenerate no detecta valores nuevos de ENUM.
"""
from alembic import op

revision = "e5a3c9d7b2f1"
down_revision = "aa6f45a22bb9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE incident_status_enum ADD VALUE IF NOT EXISTS 'en_paso_produccion'")


def downgrade() -> None:
    # PostgreSQL no permite quitar valores de un ENUM sin recrear el tipo
    pass
