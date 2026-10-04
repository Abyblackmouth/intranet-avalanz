# ----------------------------------------------------------------------
# Reglas de relevancia
# Deciden si un fragmento contiene la respuesta de una pregunta segun su
# verdad de referencia. Funciones puras: se prueban sin modelos ni datos.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import re
from pathlib import PurePosixPath

from app.domain.models import Chunk, Document, SourceKind

# Un fragmento de PDF empieza en la pagina de su primer bloque; una
# seccion larga puede empezar hasta dos paginas antes de la anotada
PAGE_TOLERANCE = 2
# Las ventanas de conversacion duran hasta 4 minutos
SECONDS_TOLERANCE = 120


# ----------------------------------------------------------------------
# Texto comparable: minusculas y espacios compactados
# ----------------------------------------------------------------------
def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


# ----------------------------------------------------------------------
# Minuto anotado (mm:ss o h:mm:ss) a segundos
# ----------------------------------------------------------------------
def _to_seconds(value: str) -> int | None:
    match = re.search(r"\d{1,2}(?::\d{2}){1,2}", value)
    if not match:
        return None
    total = 0
    for part in match.group(0).split(":"):
        total = total * 60 + int(part)
    return total


# ----------------------------------------------------------------------
# Relevancia de un fragmento para una pregunta
# Primero el documento; despues la ubicacion segun el formato.
# ----------------------------------------------------------------------
def is_relevant(question, document: Document, chunk: Chunk) -> bool:
    if not question.answerable:
        return False
    if PurePosixPath(document.relative_path).name != question.document:
        return False
    # Los nombres de archivo se repiten entre temas (capacitacion-2026-09-08 existe en
    # varios): el archivo tambien debe estar en la carpeta del tema de la pregunta
    if PurePosixPath(document.relative_path).parent.name != question.topic:
        return False
    location = question.location
    number = re.search(r"\d+", location)

    if document.kind == SourceKind.PDF and number and chunk.location.page is not None:
        page = int(number.group(0))
        return page - PAGE_TOLERANCE <= chunk.location.page <= page
    if document.kind == SourceKind.POWERPOINT and number:
        return chunk.location.slide == int(number.group(0))
    if document.kind == SourceKind.WORD:
        return _normalize(location) in _normalize(chunk.context_header)
    if document.kind == SourceKind.TEAMS_TRANSCRIPT:
        target = _to_seconds(location)
        start = chunk.location.start_seconds
        end = chunk.location.end_seconds or start
        if target is None or start is None:
            return False
        return start - SECONDS_TOLERANCE <= target <= end + SECONDS_TOLERANCE
    return False
