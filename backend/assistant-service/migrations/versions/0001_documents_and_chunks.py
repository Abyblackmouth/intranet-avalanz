# ----------------------------------------------------------------------
# Migracion 0001: documentos y fragmentos
# Esquema inicial de la base vectorial. SQL explicito para que se lea
# exactamente que se crea. La dimension del vector (384) corresponde a
# multilingual-e5-small; cambiar de modelo requiere una migracion nueva.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones e identidad de la migracion
# ----------------------------------------------------------------------
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Extension pgvector (ya activada en la Fase 0; se asegura aqui)
    # ------------------------------------------------------------------
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ------------------------------------------------------------------
    # Documentos: un registro por archivo de la carpeta de fuentes.
    # checksum detecta cambios; embedding_model dice con que modelo se
    # vectorizo, para saber que reindexar si se cambia de modelo.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE documents (
            id               uuid PRIMARY KEY,
            relative_path    text NOT NULL UNIQUE,
            module           text NOT NULL,
            topic            text NOT NULL,
            title            text NOT NULL,
            kind             text NOT NULL,
            checksum         text NOT NULL,
            size_bytes       bigint NOT NULL,
            modified_at      timestamptz NOT NULL,
            embedding_model  text NOT NULL,
            chunk_count      integer NOT NULL DEFAULT 0,
            indexed_at       timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_documents_module ON documents (module)")

    # ------------------------------------------------------------------
    # Fragmentos: texto, ubicacion para la cita, modulo copiado del
    # documento (filtro de permisos sin join), vector y texto preparado
    # para busqueda por palabras en espanol (columna generada).
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE chunks (
            id              uuid PRIMARY KEY,
            document_id     uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
            ordinal         integer NOT NULL,
            module          text NOT NULL,
            kind            text NOT NULL,
            text            text NOT NULL,
            context_header  text NOT NULL DEFAULT '',
            page            integer,
            slide           integer,
            start_seconds   real,
            end_seconds     real,
            speaker         text,
            embedding       vector(384) NOT NULL,
            search_vector   tsvector GENERATED ALWAYS AS (
                                to_tsvector('spanish', context_header || ' ' || text)
                            ) STORED,
            UNIQUE (document_id, ordinal)
        )
    """)

    # ------------------------------------------------------------------
    # Indices: HNSW para similitud coseno, GIN para texto completo y
    # modulo para filtrar por permisos
    # ------------------------------------------------------------------
    op.execute("CREATE INDEX ix_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX ix_chunks_search ON chunks USING gin (search_vector)")
    op.execute("CREATE INDEX ix_chunks_module ON chunks (module)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chunks")
    op.execute("DROP TABLE IF EXISTS documents")
