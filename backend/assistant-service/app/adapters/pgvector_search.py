# ----------------------------------------------------------------------
# Adaptadores de busqueda sobre PostgreSQL
# Busqueda semantica con pgvector, lectura de fragmentos para la cita,
# bitacora de consultas y activacion por modulo. El filtro de modulos va
# dentro del SQL: nunca se lee un fragmento que el usuario no puede ver.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import json
import uuid
from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.adapters.pgvector_store import vector_literal
from app.domain.models import BlockKind, Location, SearchHit, SearchResult


# ----------------------------------------------------------------------
# Busqueda semantica: distancia coseno con el indice HNSW
# ----------------------------------------------------------------------
class PgDenseSearcher:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def search(self, vector: Sequence[float], modules: Sequence[str],
                     limit: int) -> list[tuple[uuid.UUID, float]]:
        query = text("""
            SELECT id, 1 - (embedding <=> CAST(CAST(:v AS text) AS vector)) AS similarity
            FROM chunks
            WHERE module = ANY(:modules)
            ORDER BY embedding <=> CAST(CAST(:v AS text) AS vector)
            LIMIT :limit
        """)
        async with self.engine.connect() as connection:
            rows = (await connection.execute(query, {"v": vector_literal(vector), "modules": list(modules),
                                                     "limit": limit})).all()
        return [(row[0], float(row[1])) for row in rows]


# ----------------------------------------------------------------------
# Lectura de fragmentos con su documento, para armar la cita
# ----------------------------------------------------------------------
class PgHitReader:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def read(self, chunk_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, SearchHit]:
        if not chunk_ids:
            return {}
        query = text("""
            SELECT ch.id, d.title, d.relative_path, ch.module, ch.kind, ch.text, ch.context_header,
                   ch.page, ch.slide, ch.start_seconds, ch.end_seconds
            FROM chunks ch JOIN documents d ON d.id = ch.document_id
            WHERE ch.id = ANY(:ids)
        """)
        async with self.engine.connect() as connection:
            rows = (await connection.execute(query, {"ids": list(chunk_ids)})).all()
        return {row[0]: SearchHit(
            chunk_id=row[0], document_title=row[1], relative_path=row[2], module=row[3],
            kind=BlockKind(row[4]), text=row[5], context_header=row[6],
            location=Location(page=row[7], slide=row[8], start_seconds=row[9], end_seconds=row[10]),
        ) for row in rows}


# ----------------------------------------------------------------------
# Bitacora de consultas
# Guarda los resultados como JSON (fragmento, titulo, ubicacion y
# puntuacion) para el tablero de brechas.
# ----------------------------------------------------------------------
class PgQueryLog:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def record(self, *, user_id: str, module: str, question: str,
                     result: SearchResult, latency_ms: int) -> None:
        results = [{"chunk_id": str(h.chunk_id), "title": h.document_title,
                    "location": h.location.label(), "score": h.score} for h in result.hits]
        query = text("""
            INSERT INTO query_log (user_id, module, question, confidence, overlap, results, latency_ms)
            VALUES (:user_id, :module, :question, :confidence, :overlap,
                    CAST(CAST(:results AS text) AS jsonb), :latency_ms)
        """)
        async with self.engine.begin() as connection:
            await connection.execute(query, {
                "user_id": user_id, "module": module, "question": question,
                "confidence": str(result.confidence), "overlap": result.overlap,
                "results": json.dumps(results, ensure_ascii=False), "latency_ms": latency_ms,
            })


# ----------------------------------------------------------------------
# Activacion por modulo
# Apagado = nadie; encendido con piloto = solo esos correos; encendido
# sin piloto = todos los que tengan el modulo.
# ----------------------------------------------------------------------
class PgModuleActivation:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def is_available(self, module: str, email: str) -> bool:
        query = text("SELECT enabled, pilot_emails FROM assistant_modules WHERE module = :module")
        async with self.engine.connect() as connection:
            row = (await connection.execute(query, {"module": module})).first()
        if row is None or not row[0]:
            return False
        pilots = {p.lower() for p in (row[1] or [])}
        return not pilots or email.lower() in pilots
