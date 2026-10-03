# ----------------------------------------------------------------------
# Fragmentador por estructura
# Implementa el puerto Chunker. Convierte los bloques de un documento en
# fragmentos del tamano adecuado para buscar: junta texto de la misma
# seccion, parte lo que excede el maximo con traslape, divide tablas por
# filas repitiendo el encabezado y agrupa el habla en ventanas de
# conversacion. Solo usa el dominio: no depende de librerias externas.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.models import BlockKind, Chunk, Document, ExtractedBlock, Location


# ----------------------------------------------------------------------
# Parametros de fragmentacion
# En caracteres (en espanol, un token son unos 4 caracteres). El maximo
# deja margen para el encabezado de contexto dentro del limite de 512
# tokens de los modelos de embeddings candidatos.
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class ChunkingRules:
    # Tamano al que se busca llegar al juntar bloques (~250 tokens)
    target_chars: int = 1000
    # Tamano que ningun fragmento debe exceder (~375 tokens)
    max_chars: int = 1500
    # Texto que se repite al partir, para no cortar una idea
    overlap_chars: int = 150
    # Duracion maxima de una ventana de conversacion
    speech_max_seconds: int = 240


# Fin de oracion: punto, signo de cierre o puntos suspensivos seguidos de espacio
SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")


# ----------------------------------------------------------------------
# Borrador interno de un fragmento, antes de numerarlo
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class _Draft:
    text: str
    location: Location
    kind: BlockKind
    heading_path: tuple[str, ...]


# ----------------------------------------------------------------------
# Final de un texto para el traslape, sin cortar palabras
# ----------------------------------------------------------------------
def _tail(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[-limit:]
    space = cut.find(" ")
    return cut[space + 1:] if space != -1 else cut


# ----------------------------------------------------------------------
# Particion por palabras: ultimo recurso para una oracion enorme
# ----------------------------------------------------------------------
def _hard_split(text: str, limit: int) -> list[str]:
    pieces: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if len(candidate) > limit and current:
            pieces.append(current)
            current = word
        else:
            current = candidate
    if current:
        pieces.append(current)
    return pieces


# ----------------------------------------------------------------------
# Unidades de un texto: parrafos; si un parrafo excede el limite, sus
# oraciones; si una oracion lo excede, sus palabras
# ----------------------------------------------------------------------
def _units(text: str, limit: int) -> list[str]:
    units: list[str] = []
    for paragraph in re.split(r"\n{2,}", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(paragraph) <= limit:
            units.append(paragraph)
            continue
        for sentence in SENTENCE_END.split(paragraph):
            if len(sentence) <= limit:
                units.append(sentence)
            else:
                units.extend(_hard_split(sentence, limit))
    return units


# ----------------------------------------------------------------------
# Particion de un texto largo
# Si cabe en el maximo, queda entero. Si no, se juntan unidades hasta el
# objetivo; cada pedazo nuevo empieza con el final del anterior.
# ----------------------------------------------------------------------
def split_text(text: str, rules: ChunkingRules) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= rules.max_chars:
        return [text]
    # Las unidades dejan espacio para el traslape y el salto de linea
    limit = rules.max_chars - rules.overlap_chars - 1
    pieces: list[str] = []
    current = ""
    for unit in _units(text, limit):
        candidate = f"{current}\n{unit}" if current else unit
        if len(candidate) > rules.target_chars and current:
            pieces.append(current)
            overlap = _tail(current, rules.overlap_chars)
            current = f"{overlap}\n{unit}" if overlap else unit
        else:
            current = candidate
    if current:
        pieces.append(current)
    return pieces


# ----------------------------------------------------------------------
# Particion de una tabla en Markdown por filas
# Cada pedazo repite el encabezado y su separador, para entenderse solo.
# ----------------------------------------------------------------------
def split_table(markdown: str, rules: ChunkingRules) -> list[str]:
    lines = markdown.splitlines()
    if len(markdown) <= rules.max_chars or len(lines) <= 3:
        return [markdown]
    header = lines[:2]
    pieces: list[str] = []
    rows: list[str] = []
    for row in lines[2:]:
        if rows and len("\n".join([*header, *rows, row])) > rules.max_chars:
            pieces.append("\n".join([*header, *rows]))
            rows = [row]
        else:
            rows.append(row)
    if rows:
        pieces.append("\n".join([*header, *rows]))
    return pieces


# ----------------------------------------------------------------------
# Encabezado de contexto: tema > documento > ruta de secciones
# El tema va primero porque algunos titulos no lo mencionan
# (por ejemplo, "Capacitacion 2026-09-07" es de Nomina).
# ----------------------------------------------------------------------
def topic_label(topic: str) -> str:
    return topic.replace("-", " ").capitalize()


def build_context_header(topic: str, title: str, heading_path: Sequence[str]) -> str:
    return " > ".join(part for part in (topic, title, *heading_path) if part)


# ----------------------------------------------------------------------
# Linea de una intervencion: el hablante da contexto a la busqueda
# ----------------------------------------------------------------------
def _speech_line(block: ExtractedBlock) -> str:
    return f"{block.speaker}: {block.text}" if block.speaker else block.text


# ----------------------------------------------------------------------
# Fragmentador
# ----------------------------------------------------------------------
class StructureChunker:
    def __init__(self, rules: ChunkingRules | None = None) -> None:
        self.rules = rules or ChunkingRules()

    # ------------------------------------------------------------------
    # Recorre los bloques en orden; el texto se acumula por seccion y el
    # habla por ventana, y cada cambio de tipo cierra lo pendiente
    # ------------------------------------------------------------------
    def split(self, document: Document, blocks: Sequence[ExtractedBlock]) -> list[Chunk]:
        drafts: list[_Draft] = []
        pending_text: list[ExtractedBlock] = []
        pending_speech: list[ExtractedBlock] = []

        for block in blocks:
            if block.kind == BlockKind.SPEECH:
                drafts += self._text_drafts(pending_text)
                pending_text = []
                pending_speech.append(block)
                continue
            drafts += self._speech_drafts(pending_speech)
            pending_speech = []
            if block.kind == BlockKind.TABLE:
                drafts += self._text_drafts(pending_text)
                pending_text = []
                drafts += [_Draft(piece, block.location, BlockKind.TABLE, block.heading_path)
                           for piece in split_table(block.text, self.rules)]
            else:
                pending_text.append(block)

        drafts += self._text_drafts(pending_text)
        drafts += self._speech_drafts(pending_speech)

        topic = topic_label(document.topic)
        return [
            Chunk(
                document_id=document.id,
                ordinal=ordinal,
                text=draft.text,
                location=draft.location,
                kind=draft.kind,
                context_header=build_context_header(topic, document.title, draft.heading_path),
            )
            for ordinal, draft in enumerate(drafts)
        ]

    # ------------------------------------------------------------------
    # Texto: bloques seguidos de la misma seccion se juntan hasta el
    # objetivo; la ubicacion es la del primer bloque del grupo
    # ------------------------------------------------------------------
    def _text_drafts(self, blocks: Sequence[ExtractedBlock]) -> list[_Draft]:
        drafts: list[_Draft] = []
        text, location, path = "", None, None
        for block in blocks:
            same_section = location is not None and block.heading_path == path
            if same_section and len(text) + 2 + len(block.text) <= self.rules.target_chars:
                text = f"{text}\n\n{block.text}"
                continue
            if location is not None:
                drafts += self._pieces(text, location, path)
            text, location, path = block.text, block.location, block.heading_path
        if location is not None:
            drafts += self._pieces(text, location, path)
        return drafts

    def _pieces(self, text: str, location: Location, path: tuple[str, ...]) -> list[_Draft]:
        return [_Draft(piece, location, BlockKind.TEXT, path) for piece in split_text(text, self.rules)]

    # ------------------------------------------------------------------
    # Habla: intervenciones agrupadas hasta el objetivo o la duracion
    # maxima. La ventana nueva repite la ultima intervencion de la
    # anterior si es corta, para conservar el hilo.
    # ------------------------------------------------------------------
    def _speech_drafts(self, turns: Sequence[ExtractedBlock]) -> list[_Draft]:
        drafts: list[_Draft] = []
        window: list[ExtractedBlock] = []
        fresh = 0

        def emit() -> None:
            text = "\n".join(_speech_line(turn) for turn in window)
            start = window[0].location.start_seconds
            end = window[-1].location.end_seconds or window[-1].location.start_seconds
            location = Location(start_seconds=start, end_seconds=end)
            for piece in split_text(text, self.rules):
                drafts.append(_Draft(piece, location, BlockKind.SPEECH, ()))

        for turn in turns:
            if fresh:
                size = sum(len(_speech_line(t)) + 1 for t in window) + len(_speech_line(turn))
                span = (turn.location.start_seconds or 0) - (window[0].location.start_seconds or 0)
                if size > self.rules.target_chars or span > self.rules.speech_max_seconds:
                    emit()
                    last = window[-1]
                    window = [last] if len(_speech_line(last)) <= self.rules.overlap_chars * 2 else []
                    fresh = 0
            window.append(turn)
            fresh += 1
        if fresh:
            emit()
        return drafts
