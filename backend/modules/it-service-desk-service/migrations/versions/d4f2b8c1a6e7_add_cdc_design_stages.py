"""add cdc design stages (statuses and project manager on detail)

Revision ID: d4f2b8c1a6e7
Revises: c3e1a7d2f9b4
Create Date: 2026-09-29

Manual: el autogenerate no detecta valores nuevos de ENUM.
"""
from alembic import op
import sqlalchemy as sa

revision = "d4f2b8c1a6e7"
down_revision = "c3e1a7d2f9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for valor in ("en_diseno_funcional", "en_diseno_tecnico"):
        op.execute(f"ALTER TYPE incident_status_enum ADD VALUE IF NOT EXISTS '{valor}'")
    op.add_column("control_cambios_detalle", sa.Column("project_manager_id", sa.UUID(as_uuid=False), nullable=True))
    op.add_column("control_cambios_detalle", sa.Column("project_manager_nombre", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("control_cambios_detalle", "project_manager_nombre")
    op.drop_column("control_cambios_detalle", "project_manager_id")
    # Los valores del ENUM se quedan: PostgreSQL no permite quitarlos sin recrear el tipo
