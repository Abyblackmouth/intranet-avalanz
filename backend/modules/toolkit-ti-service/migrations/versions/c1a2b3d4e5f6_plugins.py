"""plugins: estado y ejecuciones

Revision ID: c1a2b3d4e5f6
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c1a2b3d4e5f6"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugin_estado",
        sa.Column("slug", sa.String(100), primary_key=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("actualizado_por", sa.String(200), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "plugin_ejecuciones",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="en_proceso"),
        sa.Column("parametros", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("archivos_entrada", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("archivos_salida", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("log", sa.Text(), nullable=False, server_default=""),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("iniciado_por_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("iniciado_por", sa.String(200), nullable=True),
        sa.Column("origen", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("iniciado_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("terminado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duracion_ms", sa.Integer(), nullable=True),
    )
    op.create_index("ix_plugin_ejecuciones_slug_fecha", "plugin_ejecuciones", ["slug", "iniciado_at"])


def downgrade() -> None:
    op.drop_index("ix_plugin_ejecuciones_slug_fecha", table_name="plugin_ejecuciones")
    op.drop_table("plugin_ejecuciones")
    op.drop_table("plugin_estado")
