# ----------------------------------------------------------------------
# Capa de dominio: modelos
# Conceptos del negocio del asistente. Solo usa la libreria estandar de
# Python: no conoce bases de datos, modelos de IA ni FastAPI.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# uuid para identificadores deterministas, dataclasses para modelos
# inmutables, StrEnum para catalogos legibles y PurePosixPath para leer
# rutas sin tocar el disco.
# ----------------------------------------------------------------------
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from pathlib import PurePosixPath

# ----------------------------------------------------------------------
# Espacio de nombres de los identificadores
# uuid5 combina este espacio con un texto (por ejemplo, la ruta de un
# documento) y produce siempre el mismo UUID para el mismo texto. Este
# valor no debe cambiar nunca: cambiarlo cambia todos los IDs.
# ----------------------------------------------------------------------
NAMESPACE_ASSISTANT = uuid.UUID("6f1d2c9e-8b3a-4e57-9a41-2c7d5b0e8f13")

# Sufijo de las transcripciones que acompanan a un video con el mismo nombre
TRANSCRIPT_SUFFIX = ".transcripcion"

# Tema asignado a los documentos que estan directamente en la carpeta del modulo
DEFAULT_TOPIC = "general"


# ----------------------------------------------------------------------
# Tipo de documento fuente
# Define que cargador lo procesa.
# ----------------------------------------------------------------------
class SourceKind(StrEnum):
    PDF = "pdf"
    WORD = "docx"
    POWERPOINT = "pptx"
    TEXT = "text"
    VIDEO = "video"
    TEAMS_TRANSCRIPT = "teams_transcript"


# ----------------------------------------------------------------------
# Tipo de bloque extraido
# El texto normal, las tablas y el habla se fragmentan de forma distinta.
# ----------------------------------------------------------------------
class BlockKind(StrEnum):
    TEXT = "text"
    TABLE = "table"
    SPEECH = "speech"


# ----------------------------------------------------------------------
# Formato de tiempo para citas de video
# mm:ss en videos cortos y h:mm:ss a partir de una hora.
# ----------------------------------------------------------------------
def format_timestamp(seconds: float) -> str:
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


# ----------------------------------------------------------------------
# Ubicacion de un texto dentro de su documento
# Solo se llena el campo que aplica segun el tipo de documento. label()
# genera la referencia que vera el usuario en la cita.
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class Location:
    page: int | None = None
    slide: int | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None

    def label(self) -> str:
        if self.start_seconds is not None:
            return f"minuto {format_timestamp(self.start_seconds)}"
        if self.slide is not None:
            return f"diapositiva {self.slide}"
        if self.page is not None:
            return f"página {self.page}"
        return ""


# ----------------------------------------------------------------------
# Bloque extraido de un documento
# Unidad que entregan los cargadores, antes de fragmentar: un parrafo,
# una tabla o una intervencion en un video. heading_path guarda los
# titulos de seccion bajo los que aparece.
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class ExtractedBlock:
    text: str
    location: Location
    kind: BlockKind = BlockKind.TEXT
    heading_path: tuple[str, ...] = ()
    speaker: str | None = None


# ----------------------------------------------------------------------
# Lectura de la convencion de carpetas: modulo/tema/archivo
# El primer nivel es el modulo (contexto y permisos) y el segundo el
# tema. Un archivo directo en la carpeta del modulo toma el tema general.
# ----------------------------------------------------------------------
def parse_source_path(relative_path: str) -> tuple[str, str]:
    parts = PurePosixPath(relative_path).parts
    if len(parts) < 2:
        raise ValueError(f"La ruta no sigue la convencion modulo/tema/archivo: {relative_path}")
    module = parts[0]
    topic = parts[1] if len(parts) >= 3 else DEFAULT_TOPIC
    return module, topic


# ----------------------------------------------------------------------
# Titulo legible a partir del nombre del archivo
# Quita la extension y el sufijo de transcripcion, y cambia guiones por
# espacios, excepto los guiones dentro de fechas (2026-09-07).
# ----------------------------------------------------------------------
def title_from_filename(filename: str) -> str:
    stem = PurePosixPath(filename).stem
    if stem.endswith(TRANSCRIPT_SUFFIX):
        stem = stem[: -len(TRANSCRIPT_SUFFIX)]
    text = re.sub(r"(?<!\d)-|-(?!\d)", " ", stem.replace("_", "-"))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:1].upper() + text[1:]


# ----------------------------------------------------------------------
# Documento fuente
# Un archivo de la carpeta de fuentes. El id depende solo de la ruta, asi
# que es estable entre ingestas; checksum (SHA-256) detecta si el
# contenido cambio y hay que reindexarlo.
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class Document:
    id: uuid.UUID
    relative_path: str
    module: str
    topic: str
    title: str
    kind: SourceKind
    checksum: str
    size_bytes: int
    modified_at: datetime

    @staticmethod
    def id_for(relative_path: str) -> uuid.UUID:
        return uuid.uuid5(NAMESPACE_ASSISTANT, relative_path)


# ----------------------------------------------------------------------
# Fragmento indexable
# Unidad que se vectoriza y se guarda. context_header es la ruta de
# contexto ("Titulo > Seccion") que se antepone al texto al vectorizar,
# para que el fragmento conserve de que trata aunque su texto no lo diga.
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class Chunk:
    document_id: uuid.UUID
    ordinal: int
    text: str
    location: Location
    kind: BlockKind = BlockKind.TEXT
    context_header: str = ""
    speaker: str | None = None

    @property
    def id(self) -> uuid.UUID:
        return uuid.uuid5(NAMESPACE_ASSISTANT, f"{self.document_id}:{self.ordinal}")

    @property
    def embedding_text(self) -> str:
        if self.context_header:
            return f"{self.context_header}\n{self.text}"
        return self.text
