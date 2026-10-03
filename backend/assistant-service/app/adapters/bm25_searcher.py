# ----------------------------------------------------------------------
# Busqueda por palabras con BM25 en memoria
# La misma implementacion evaluada (rank_bm25, misma tokenizacion y el
# mismo texto: encabezado de contexto mas fragmento). Carga los
# fragmentos de la base y se recarga cuando la ingesta cambia el indice.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import asyncio
import re
import time
import unicodedata
import uuid
from collections.abc import Sequence

import numpy as np
from rank_bm25 import BM25Okapi
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


# ----------------------------------------------------------------------
# Tokenizacion: sin acentos, minusculas, palabras de 3 letras o mas.
# Igual a la del banco de evaluacion.
# ----------------------------------------------------------------------
def tokenize(value: str) -> list[str]:
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return [token for token in re.findall(r"\w+", plain) if len(token) > 2]


class InMemoryBm25Searcher:
    def __init__(self, engine: AsyncEngine, refresh_seconds: int = 300) -> None:
        self.engine = engine
        self.refresh_seconds = refresh_seconds
        self._lock = asyncio.Lock()
        self._version: tuple | None = None
        self._checked = 0.0
        self._ids: list[uuid.UUID] = []
        self._modules = np.array([], dtype=object)
        self._bm25: BM25Okapi | None = None

    # ------------------------------------------------------------------
    # Recarga si el indice cambio (numero de documentos o ultima
    # indexacion); la revision se hace como maximo cada refresh_seconds
    # ------------------------------------------------------------------
    async def _ensure_fresh(self) -> None:
        if self._bm25 is not None and time.monotonic() - self._checked < self.refresh_seconds:
            return
        async with self._lock:
            if self._bm25 is not None and time.monotonic() - self._checked < self.refresh_seconds:
                return
            async with self.engine.connect() as connection:
                version = tuple((await connection.execute(
                    text("SELECT count(*), max(indexed_at) FROM documents"))).one())
                if version != self._version or self._bm25 is None:
                    rows = (await connection.execute(
                        text("SELECT id, module, context_header, text FROM chunks ORDER BY id"))).all()
                    self._ids = [row[0] for row in rows]
                    self._modules = np.array([row[1] for row in rows], dtype=object)
                    corpus = [tokenize(f"{row[2]}\n{row[3]}" if row[2] else row[3]) for row in rows]
                    self._bm25 = BM25Okapi(corpus) if corpus else None
                    self._version = version
            self._checked = time.monotonic()

    # ------------------------------------------------------------------
    # Busqueda: puntua todo el corpus y descarta los modulos no permitidos
    # ------------------------------------------------------------------
    async def search(self, query: str, modules: Sequence[str], limit: int) -> list[tuple[uuid.UUID, float]]:
        await self._ensure_fresh()
        if self._bm25 is None:
            return []
        scores = self._bm25.get_scores(tokenize(query))
        scores = np.where(np.isin(self._modules, list(modules)), scores, -np.inf)
        top = np.argsort(-scores)[:limit]
        return [(self._ids[i], float(scores[i])) for i in top if np.isfinite(scores[i])]
