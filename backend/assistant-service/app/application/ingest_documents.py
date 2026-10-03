# ----------------------------------------------------------------------
# Caso de uso: ingesta de documentos
# Recorre la carpeta de fuentes y deja el indice igual a ella: indexa lo
# nuevo, reindexa lo que cambio (huella o modelo), salta lo que sigue
# igual y quita lo que se borro. Solo conoce puertos, asi que se prueba
# sin base de datos ni modelo de IA.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import hashlib
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.domain.models import TRANSCRIPT_SUFFIX, Document, parse_source_path, title_from_filename
from app.domain.ports import Chunker, ChunkStore, DocumentLoader, Embedder

logger = logging.getLogger("assistant.ingest")

# Extensiones de video: se indexa su transcripcion, no el video
VIDEO_SUFFIXES = (".mp4", ".mov", ".mkv")


# ----------------------------------------------------------------------
# Reporte de una ejecucion
# ----------------------------------------------------------------------
@dataclass
class IngestReport:
    new: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0
    failed: list[str] = field(default_factory=list)
    videos_without_transcript: list[str] = field(default_factory=list)
    chunks_written: int = 0
    seconds: float = 0.0

    def as_line(self) -> str:
        return (f"nuevos={self.new} | actualizados={self.updated} | sin_cambios={self.unchanged} | "
                f"eliminados={self.removed} | fallidos={len(self.failed)} | "
                f"videos_sin_transcripcion={len(self.videos_without_transcript)} | "
                f"fragmentos={self.chunks_written} | segundos={self.seconds}")


# ----------------------------------------------------------------------
# Huella SHA-256 de un archivo, leido por bloques para no cargarlo entero
# ----------------------------------------------------------------------
def file_checksum(path: Path, block: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(block):
            digest.update(chunk)
    return digest.hexdigest()


class IngestDocuments:
    def __init__(self, loaders: Sequence[DocumentLoader], chunker: Chunker, embedder: Embedder,
                 store: ChunkStore, sources: Path, batch_size: int = 32) -> None:
        self.loaders = loaders
        self.chunker = chunker
        self.embedder = embedder
        self.store = store
        self.sources = sources
        self.batch_size = batch_size

    # ------------------------------------------------------------------
    # Ejecucion completa
    # Un archivo que falla se reporta y no detiene a los demas; su version
    # anterior en el indice se conserva (no se considera borrado).
    # ------------------------------------------------------------------
    async def run(self) -> IngestReport:
        start = time.perf_counter()
        report = IngestReport()
        indexed = await self.store.indexed_documents()
        seen: set[str] = set()

        for path in sorted(self.sources.rglob("*")):
            if not path.is_file() or path.name.startswith("."):
                continue
            relative = path.relative_to(self.sources).as_posix()

            # Video: su transcripcion de Teams ya se indexa por separado
            if path.suffix.lower() in VIDEO_SUFFIXES:
                if not path.with_name(f"{path.stem}{TRANSCRIPT_SUFFIX}.docx").exists():
                    report.videos_without_transcript.append(relative)
                continue

            loader = next((l for l in self.loaders if l.supports(path)), None)
            if loader is None:
                continue
            seen.add(relative)

            checksum = file_checksum(path)
            previous = indexed.get(relative)
            if previous == (checksum, self.embedder.model_name):
                report.unchanged += 1
                continue

            try:
                written = await self._index(path, relative, loader, checksum)
            except Exception:
                logger.exception("No se pudo indexar %s", relative)
                report.failed.append(relative)
                continue

            report.chunks_written += written
            if previous is None:
                report.new += 1
            else:
                report.updated += 1

        # Documentos indexados que ya no estan en la carpeta
        for relative in sorted(set(indexed) - seen):
            await self.store.remove_document(relative)
            report.removed += 1

        report.seconds = round(time.perf_counter() - start, 1)
        return report

    # ------------------------------------------------------------------
    # Un documento: cargar, fragmentar, vectorizar por lotes y guardar
    # ------------------------------------------------------------------
    async def _index(self, path: Path, relative: str, loader: DocumentLoader, checksum: str) -> int:
        module, topic = parse_source_path(relative)
        stat = path.stat()
        document = Document(
            id=Document.id_for(relative), relative_path=relative, module=module, topic=topic,
            title=title_from_filename(path.name), kind=loader.kind, checksum=checksum,
            size_bytes=stat.st_size, modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        )
        chunks = self.chunker.split(document, loader.load(path))
        texts = [chunk.embedding_text for chunk in chunks]
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            vectors += self.embedder.embed_documents(texts[start:start + self.batch_size])
        await self.store.replace_document(document, chunks, vectors, self.embedder.model_name)
        logger.info("Indexado %s: %d fragmentos", relative, len(chunks))
        return len(chunks)
