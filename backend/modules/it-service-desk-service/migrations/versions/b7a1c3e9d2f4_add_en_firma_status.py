"""Estatus en_firma para las solicitudes de acceso que esperan firmas

Revision ID: b7a1c3e9d2f4
Revises: e6e9c81e9ba2
"""
from alembic import op

revision = "b7a1c3e9d2f4"
down_revision = "e6e9c81e9ba2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE incident_status_enum ADD VALUE IF NOT EXISTS 'en_firma'")


def downgrade() -> None:
    pass   # PostgreSQL no permite quitar valores de un enum
