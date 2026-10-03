# ----------------------------------------------------------------------
# Tarea de ingesta
# Arma las piezas concretas (cargadores, fragmentador, modelo ONNX y
# almacen pgvector) y ejecuta el caso de uso. Corre en el contenedor
# temporal assistant-ingest, nunca dentro del servicio que atiende a los
# usuarios. Regresa codigo 1 si algun archivo fallo. Uso:
#   python -m app.jobs.ingest
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import asyncio
import logging
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine

from app.adapters.onnx_embedder import OnnxEmbedder
from app.adapters.pgvector_store import PgVectorChunkStore
from app.application.ingest_documents import IngestDocuments
from app.config import settings
from app.pipeline.chunking.structure_chunker import StructureChunker
from app.pipeline.loaders.registry import default_loaders

# Carpeta del modelo dentro de MODELS_PATH (exportado con tools.export_onnx_embedder)
EMBEDDING_MODEL_DIR = "e5-small"


async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    engine = create_async_engine(settings.DATABASE_URL, pool_size=2)
    try:
        use_case = IngestDocuments(
            loaders=default_loaders(),
            chunker=StructureChunker(),
            embedder=OnnxEmbedder(Path(settings.MODELS_PATH) / EMBEDDING_MODEL_DIR),
            store=PgVectorChunkStore(engine),
            sources=Path(settings.SOURCES_PATH),
        )
        report = await use_case.run()
    finally:
        await engine.dispose()
    print(f"INGESTA: {report.as_line()}", flush=True)
    for relative in report.failed:
        print(f"FALLIDO: {relative}", flush=True)
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
