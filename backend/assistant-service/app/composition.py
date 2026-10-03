# ----------------------------------------------------------------------
# Composicion de dependencias
# Arma las piezas concretas del servicio al arrancar. Si el modelo no se
# puede cargar, el servicio arranca igual: la busqueda queda en None y
# responde 503, y la salud lo reporta.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine

from app.adapters.bm25_searcher import InMemoryBm25Searcher
from app.adapters.pgvector_search import PgDenseSearcher, PgHitReader, PgModuleActivation, PgQueryLog
from app.application.search_knowledge import SearchKnowledge
from app.config import settings

logger = logging.getLogger("assistant")

# Carpeta del modelo dentro de MODELS_PATH
EMBEDDING_MODEL_DIR = "e5-small"


@dataclass
class Components:
    search: SearchKnowledge | None
    activation: PgModuleActivation
    error: str | None = None


async def build_components(engine: AsyncEngine) -> Components:
    activation = PgModuleActivation(engine)
    try:
        from app.adapters.onnx_embedder import OnnxEmbedder
        embedder = OnnxEmbedder(Path(settings.MODELS_PATH) / EMBEDDING_MODEL_DIR, threads=2)
    except Exception as error:
        logger.exception("No se pudo cargar el modelo de embeddings")
        return Components(search=None, activation=activation, error=str(error))
    search = SearchKnowledge(embedder, PgDenseSearcher(engine), InMemoryBm25Searcher(engine),
                             PgHitReader(engine), PgQueryLog(engine))
    return Components(search=search, activation=activation)
