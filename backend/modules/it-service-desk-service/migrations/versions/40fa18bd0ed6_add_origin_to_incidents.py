"""add origin to incidents

Origen del ticket para metricas: 'manual' (formulario) o 'asistente'
(creado desde el chat). No se muestra en el frontend.

Revision ID: 40fa18bd0ed6
Revises: b7a1c3e9d2f4
"""
from alembic import op
import sqlalchemy as sa

revision = "40fa18bd0ed6"
down_revision = "b7a1c3e9d2f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("origin", sa.String(20), nullable=False, server_default="manual"))


def downgrade() -> None:
    op.drop_column("incidents", "origin")
