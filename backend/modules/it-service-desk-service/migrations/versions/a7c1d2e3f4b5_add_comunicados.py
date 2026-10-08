"""add comunicados

Comunicados operativos del IT Service Desk: avisos con vigencia (inicio y
fin) que se muestran en un modal a los usuarios del modulo.

Revision ID: a7c1d2e3f4b5
Revises: 40fa18bd0ed6
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7c1d2e3f4b5"
down_revision = "40fa18bd0ed6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comunicados",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("titulo", sa.String(150), nullable=False),
        sa.Column("mensaje", sa.Text(), nullable=False),
        sa.Column("inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fin", sa.DateTime(timezone=True), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("creado_por", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("creado_por_nombre", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_comunicados_vigencia", "comunicados", ["activo", "inicio", "fin"])


def downgrade() -> None:
    op.drop_index("ix_comunicados_vigencia", table_name="comunicados")
    op.drop_table("comunicados")
