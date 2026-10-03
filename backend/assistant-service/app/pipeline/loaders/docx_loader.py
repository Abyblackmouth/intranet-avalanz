# ----------------------------------------------------------------------
# Cargador de Word
# Implementa el puerto DocumentLoader para documentos .docx (excepto las
# transcripciones de Teams, que tienen su propio cargador). Recorre el
# cuerpo en orden, detecta titulos por estilo, ignora la portada y las
# secciones sin contenido, y separa las tablas.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# python-docx lee el documento; qn traduce nombres de etiquetas XML para
# distinguir parrafos (w:p) de tablas (w:tbl) al recorrer el cuerpo.
# ----------------------------------------------------------------------
from collections.abc import Sequence
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.domain.models import TRANSCRIPT_SUFFIX, BlockKind, ExtractedBlock, Location, SourceKind
from app.pipeline.loaders.common import (
    DEFAULT_IGNORED_SECTIONS,
    is_ignored_title,
    normalize_line,
    table_to_markdown,
)
from app.pipeline.loaders.docx_rules import dedupe_merged_cells, heading_level_from_style, is_list_style


# ----------------------------------------------------------------------
# Estilo de un parrafo
# El nombre visible si el estilo esta definido; si no, el identificador
# crudo del XML.
# ----------------------------------------------------------------------
def _style_of(paragraph: Paragraph) -> str:
    if paragraph.style is not None:
        return paragraph.style.name
    return paragraph._p.style or ""


# ----------------------------------------------------------------------
# Filas de una tabla con las celdas combinadas una sola vez
# ----------------------------------------------------------------------
def _table_rows(table: Table) -> list[list[str]]:
    return [dedupe_merged_cells([(cell._tc, cell.text) for cell in row.cells]) for row in table.rows]


# ----------------------------------------------------------------------
# Constructor de bloques por seccion
# Nada se registra antes del primer titulo (portada). Una seccion
# ignorada salta todo hasta el siguiente titulo de igual o mayor nivel.
# Word no guarda paginas, asi que la ubicacion queda en la ruta de
# secciones.
# ----------------------------------------------------------------------
class _SectionBuilder:
    def __init__(self, ignored: Sequence[str]) -> None:
        self._ignored = ignored
        self._headings: list[tuple[int, str]] = []
        self._skip_level: int | None = None
        self._started = False
        self._lines: list[str] = []
        self.blocks: list[ExtractedBlock] = []

    @property
    def _path(self) -> tuple[str, ...]:
        return tuple(text for _, text in self._headings)

    @property
    def _active(self) -> bool:
        return self._started and self._skip_level is None

    def _flush(self) -> None:
        if self._lines:
            self.blocks.append(ExtractedBlock(
                text="\n".join(self._lines),
                location=Location(),
                kind=BlockKind.TEXT,
                heading_path=self._path,
            ))
        self._lines = []

    def heading(self, level: int, text: str) -> None:
        self._flush()
        self._started = True
        if self._skip_level is not None and level <= self._skip_level:
            self._skip_level = None
        while self._headings and self._headings[-1][0] >= level:
            self._headings.pop()
        if is_ignored_title(text, self._ignored):
            self._skip_level = level
            return
        if self._skip_level is None:
            self._headings.append((level, text))

    def paragraph(self, text: str) -> None:
        if self._active:
            self._lines.append(text)

    def table(self, markdown: str) -> None:
        if not self._active:
            return
        self._flush()
        self.blocks.append(ExtractedBlock(
            text=markdown,
            location=Location(),
            kind=BlockKind.TABLE,
            heading_path=self._path,
        ))

    def finish(self) -> list[ExtractedBlock]:
        self._flush()
        return self.blocks


# ----------------------------------------------------------------------
# Cargador
# ----------------------------------------------------------------------
class WordLoader:
    kind = SourceKind.WORD

    def __init__(self, ignored_sections: Sequence[str] = DEFAULT_IGNORED_SECTIONS) -> None:
        self.ignored_sections = ignored_sections

    def supports(self, path: Path) -> bool:
        name = path.name.lower()
        return name.endswith(".docx") and not name.endswith(f"{TRANSCRIPT_SUFFIX}.docx")

    # ------------------------------------------------------------------
    # El cuerpo se recorre en orden para que cada tabla quede en la
    # seccion donde aparece
    # ------------------------------------------------------------------
    def load(self, path: Path) -> list[ExtractedBlock]:
        document = Document(str(path))
        builder = _SectionBuilder(self.ignored_sections)
        for element in document.element.body.iterchildren():
            if element.tag == qn("w:p"):
                paragraph = Paragraph(element, document)
                text = normalize_line(paragraph.text)
                if not text:
                    continue
                style = _style_of(paragraph)
                level = heading_level_from_style(style)
                if level is not None:
                    builder.heading(level, text)
                else:
                    builder.paragraph(f"- {text}" if is_list_style(style) else text)
            elif element.tag == qn("w:tbl"):
                markdown = table_to_markdown(_table_rows(Table(element, document)))
                if markdown:
                    builder.table(markdown)
        return builder.finish()
