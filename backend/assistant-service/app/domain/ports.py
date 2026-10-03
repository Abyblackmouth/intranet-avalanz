# ----------------------------------------------------------------------
# Capa de dominio: puertos
# Interfaces que el nucleo necesita, sin decir como se implementan. Los
# adaptadores (pgvector, modelos de IA, lectores de archivos) cumplen
# estos contratos; cambiar de proveedor es escribir otro adaptador.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# Protocol define contratos por estructura: cualquier clase con estos
# metodos los cumple, sin heredar de nada.
# ----------------------------------------------------------------------
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

from app.domain.models import Chunk, Document, ExtractedBlock, SearchHit, SearchResult, SourceKind


# ----------------------------------------------------------------------
# Cargador de documentos
# Lee un archivo y entrega sus bloques de texto con su ubicacion. Hay uno
# por formato (PDF, Word, PowerPoint, texto, transcripcion de Teams).
# ----------------------------------------------------------------------
class DocumentLoader(Protocol):
    kind: SourceKind

    def supports(self, path: Path) -> bool: ...

    def load(self, path: Path) -> list[ExtractedBlock]: ...


# ----------------------------------------------------------------------
# Transcriptor de audio y video
# Convierte el audio en bloques de habla con su minuto de inicio y fin.
# Se usa solo para videos que no traen transcripcion de Teams.
# ----------------------------------------------------------------------
class Transcriber(Protocol):
    model_name: str

    def transcribe(self, media_path: Path) -> list[ExtractedBlock]: ...


# ----------------------------------------------------------------------
# Fragmentador
# Convierte los bloques de un documento en fragmentos del tamano
# adecuado para buscar, respetando su estructura.
# ----------------------------------------------------------------------
class Chunker(Protocol):
    def split(self, document: Document, blocks: Sequence[ExtractedBlock]) -> list[Chunk]: ...


# ----------------------------------------------------------------------
# Modelo de embeddings
# Convierte texto en vectores. Documentos y preguntas se vectorizan por
# separado porque algunos modelos (como e5) necesitan prefijos distintos.
# ----------------------------------------------------------------------
class Embedder(Protocol):
    model_name: str
    dimensions: int

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


# ----------------------------------------------------------------------
# Almacen de fragmentos
# Guarda documentos, fragmentos y vectores. indexed_documents (ruta ->
# huella y modelo de embeddings) permite a
# la ingesta saber que documentos son nuevos, cuales cambiaron y cuales
# se borraron, sin volver a procesar lo que no cambio.
# ----------------------------------------------------------------------
class ChunkStore(Protocol):
    async def indexed_documents(self) -> dict[str, tuple[str, str]]: ...

    async def replace_document(
        self,
        document: Document,
        chunks: Sequence[Chunk],
        vectors: Sequence[Sequence[float]],
        embedding_model: str,
    ) -> None: ...

    async def remove_document(self, relative_path: str) -> None: ...


# ----------------------------------------------------------------------
# Busqueda semantica: los fragmentos mas cercanos a un vector, solo de
# los modulos permitidos. Regresa (id, similitud) ordenados.
# ----------------------------------------------------------------------
class DenseSearcher(Protocol):
    async def search(self, vector: Sequence[float], modules: Sequence[str],
                     limit: int) -> list[tuple[uuid.UUID, float]]: ...


# ----------------------------------------------------------------------
# Busqueda por palabras: los fragmentos con mas coincidencias de
# terminos, solo de los modulos permitidos. Regresa (id, puntuacion).
# ----------------------------------------------------------------------
class LexicalSearcher(Protocol):
    async def search(self, query: str, modules: Sequence[str],
                     limit: int) -> list[tuple[uuid.UUID, float]]: ...


# ----------------------------------------------------------------------
# Lectura de fragmentos con lo necesario para citarlos
# ----------------------------------------------------------------------
class HitReader(Protocol):
    async def read(self, chunk_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, SearchHit]: ...


# ----------------------------------------------------------------------
# Bitacora de consultas: materia prima del tablero de brechas
# ----------------------------------------------------------------------
class QueryLog(Protocol):
    async def record(self, *, user_id: str, module: str, question: str,
                     result: SearchResult, latency_ms: int) -> None: ...

