# ----------------------------------------------------------------------
# Almacen de fragmentos en PostgreSQL con pgvector
# Implementa el puerto ChunkStore. Cada documento se reemplaza en una
# sola transaccion: o quedan todos sus fragmentos nuevos o ninguno. Los
# vectores viajan como texto y se convierten a vector en la base.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.models import Chunk, Document


# ----------------------------------------------------------------------
# Vector a su representacion de texto de pgvector: [0.1,0.2,...]
# ----------------------------------------------------------------------
def vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.7f}" for value in values) + "]"


INSERT_DOCUMENT = text("""
    INSERT INTO documents (id, relative_path, module, topic, title, kind, checksum,
                           size_bytes, modified_at, embedding_model, chunk_count)
    VALUES (:id, :relative_path, :module, :topic, :title, :kind, :checksum,
            :size_bytes, :modified_at, :embedding_model, :chunk_count)
""")

INSERT_CHUNK = text("""
    INSERT INTO chunks (id, document_id, ordinal, module, kind, text, context_header,
                        page, slide, start_seconds, end_seconds, speaker, embedding)
    VALUES (:id, :document_id, :ordinal, :module, :kind, :text, :context_header,
            :page, :slide, :start_seconds, :end_seconds, :speaker,
            CAST(CAST(:embedding AS text) AS vector))
""")


class PgVectorChunkStore:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    # ------------------------------------------------------------------
    # Ruta -> (huella, modelo) de lo que ya esta indexado
    # ------------------------------------------------------------------
    async def indexed_documents(self) -> dict[str, tuple[str, str]]:
        async with self.engine.connect() as connection:
            rows = (await connection.execute(
                text("SELECT relative_path, checksum, embedding_model FROM documents"))).all()
        return {row[0]: (row[1], row[2]) for row in rows}

    # ------------------------------------------------------------------
    # Reemplazo completo de un documento y sus fragmentos
    # Borrar el documento borra sus fragmentos (ON DELETE CASCADE).
    # ------------------------------------------------------------------
    async def replace_document(self, document: Document, chunks: Sequence[Chunk],
                               vectors: Sequence[Sequence[float]], embedding_model: str) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(text("DELETE FROM documents WHERE id = :id OR relative_path = :path"),
                                     {"id": document.id, "path": document.relative_path})
            await connection.execute(INSERT_DOCUMENT, {
                "id": document.id, "relative_path": document.relative_path, "module": document.module,
                "topic": document.topic, "title": document.title, "kind": str(document.kind),
                "checksum": document.checksum, "size_bytes": document.size_bytes,
                "modified_at": document.modified_at, "embedding_model": embedding_model,
                "chunk_count": len(chunks),
            })
            if chunks:
                await connection.execute(INSERT_CHUNK, [{
                    "id": chunk.id, "document_id": document.id, "ordinal": chunk.ordinal,
                    "module": document.module, "kind": str(chunk.kind), "text": chunk.text,
                    "context_header": chunk.context_header, "page": chunk.location.page,
                    "slide": chunk.location.slide, "start_seconds": chunk.location.start_seconds,
                    "end_seconds": chunk.location.end_seconds, "speaker": chunk.speaker,
                    "embedding": vector_literal(vector),
                } for chunk, vector in zip(chunks, vectors)])

    # ------------------------------------------------------------------
    # Baja de un documento que ya no esta en la carpeta de fuentes
    # ------------------------------------------------------------------
    async def remove_document(self, relative_path: str) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(text("DELETE FROM documents WHERE relative_path = :path"),
                                     {"path": relative_path})
