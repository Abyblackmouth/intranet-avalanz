# ----------------------------------------------------------------------
# Migracion 0002: activacion por modulo y bitacora de consultas
# assistant_modules decide en que modulos aparece el asistente y para
# quien (piloto). query_log guarda cada consulta para el tablero de
# brechas. Arranca con it-service-desk activo solo para el piloto.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones e identidad de la migracion
# ----------------------------------------------------------------------
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Activacion: apagado = nadie; encendido con piloto = solo esos
    # correos; encendido sin piloto = todos los que tengan el modulo
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE assistant_modules (
            module        text PRIMARY KEY,
            enabled       boolean NOT NULL DEFAULT false,
            pilot_emails  text[] NOT NULL DEFAULT '{}',
            updated_at    timestamptz NOT NULL DEFAULT now(),
            updated_by    text NOT NULL DEFAULT ''
        )
    """)
    op.execute("""
        INSERT INTO assistant_modules (module, enabled, pilot_emails, updated_by)
        VALUES ('it-service-desk', true, ARRAY['abraham_covarrubias@avalanz.com'], 'migracion 0002')
    """)

    # ------------------------------------------------------------------
    # Bitacora de consultas
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE query_log (
            id           bigserial PRIMARY KEY,
            asked_at     timestamptz NOT NULL DEFAULT now(),
            user_id      text NOT NULL,
            module       text NOT NULL,
            question     text NOT NULL,
            confidence   text NOT NULL,
            overlap      integer NOT NULL,
            results      jsonb NOT NULL DEFAULT '[]',
            latency_ms   integer NOT NULL,
            escalated    boolean NOT NULL DEFAULT false
        )
    """)
    op.execute("CREATE INDEX ix_query_log_asked_at ON query_log (asked_at)")
    op.execute("CREATE INDEX ix_query_log_confidence ON query_log (confidence)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS query_log")
    op.execute("DROP TABLE IF EXISTS assistant_modules")
