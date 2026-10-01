"""add ajustes_historial and access-control default settings

Revision ID: f6b4d2a8c1e3
Revises: e5a3c9d7b2f1
Create Date: 2026-09-30
"""
from alembic import op
import sqlalchemy as sa

revision = "f6b4d2a8c1e3"
down_revision = "e5a3c9d7b2f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ajustes_historial",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("key", sa.String(length=100), nullable=False, index=True),
        sa.Column("valor_anterior", sa.Text(), nullable=True),
        sa.Column("valor_nuevo", sa.Text(), nullable=False),
        sa.Column("usuario_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("usuario_nombre", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    for key, value in (("acc.metodo_firma", "manual"), ("acc.docusign_ambiente", "pruebas")):
        op.execute(sa.text("INSERT INTO incidencias_settings (id, key, value, updated_at) "
                           "VALUES (gen_random_uuid(), :k, :v, now()) ON CONFLICT (key) DO NOTHING").bindparams(k=key, v=value))


def downgrade() -> None:
    op.drop_table("ajustes_historial")
