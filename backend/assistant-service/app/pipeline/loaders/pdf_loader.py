# ----------------------------------------------------------------------
# Cargador de PDF
# Implementa el puerto DocumentLoader. Lee cada pagina con pdfplumber,
# descarta portada, indice, encabezado y pie, separa las tablas y arma
# bloques de texto con su pagina y su ruta de secciones.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# pdfplumber da texto, posicion y tamano de letra por linea, y detecta
# tablas. Las reglas de interpretacion vienen de pdf_rules.
# ----------------------------------------------------------------------
from collections import Counter
from pathlib import Path

import pdfplumber

from app.domain.models import BlockKind, ExtractedBlock, Location, SourceKind
from app.pipeline.loaders.pdf_rules import (
    PdfLayoutRules,
    heading_level,
    is_ignored_section,
    is_page_number,
    is_toc_line,
    normalize_line,
    table_to_markdown,
)


# ----------------------------------------------------------------------
# Tamano de letra de una linea
# El mas comun entre sus caracteres, para no confundirse con una letra
# suelta de otro tamano.
# ----------------------------------------------------------------------
def _line_size(line: dict) -> float:
    sizes = Counter(round(char["size"], 1) for char in line["chars"])
    return sizes.most_common(1)[0][0] if sizes else 0.0


# ----------------------------------------------------------------------
# Una linea esta dentro de una tabla si su centro cae en el recuadro
# ----------------------------------------------------------------------
def _inside(line: dict, box: tuple[float, float, float, float]) -> bool:
    x0, top, x1, bottom = box
    center_x = (line["x0"] + line["x1"]) / 2
    center_y = (line["top"] + line["bottom"]) / 2
    return x0 <= center_x <= x1 and top <= center_y <= bottom


# ----------------------------------------------------------------------
# Constructor de bloques
# Lleva la ruta de secciones vigente y acumula el texto del parrafo en
# curso. Un bloque se cierra al cambiar de titulo, de pagina o al
# encontrar una tabla.
# ----------------------------------------------------------------------
class _BlockBuilder:
    def __init__(self, paragraph_gap: float) -> None:
        self._gap = paragraph_gap
        self._headings: list[tuple[int, str]] = []
        self._last_heading: tuple[int, float] | None = None
        # Nivel de la seccion ignorada en curso; None si no hay ninguna
        self._skip_level: int | None = None
        self._text = ""
        self._page: int | None = None
        self._last_bottom = 0.0
        self.blocks: list[ExtractedBlock] = []

    @property
    def _path(self) -> tuple[str, ...]:
        return tuple(text for _, text in self._headings)

    def _flush(self) -> None:
        if self._text.strip() and self._page is not None:
            self.blocks.append(ExtractedBlock(
                text=self._text.strip(),
                location=Location(page=self._page),
                kind=BlockKind.TEXT,
                heading_path=self._path,
            ))
        self._text = ""

    # Un titulo largo que ocupa dos lineas se une en un solo titulo. Un
    # titulo ignorado salta todo hasta el siguiente de igual o mayor nivel.
    def set_heading(self, level: int, text: str, top: float, bottom: float,
                    ignored: bool = False) -> None:
        if (self._skip_level is None and self._last_heading
                and self._last_heading[0] == level and top - self._last_heading[1] <= self._gap):
            self._headings[-1] = (level, f"{self._headings[-1][1]} {text}")
            self._last_heading = (level, bottom)
            return
        self._flush()
        if self._skip_level is not None and level <= self._skip_level:
            self._skip_level = None
        while self._headings and self._headings[-1][0] >= level:
            self._headings.pop()
        if ignored:
            self._skip_level = level
            self._last_heading = None
            return
        if self._skip_level is not None:
            return
        self._headings.append((level, text))
        self._last_heading = (level, bottom)

    # Un espacio vertical grande entre lineas inicia un parrafo nuevo
    def add_line(self, text: str, page: int, top: float, bottom: float) -> None:
        self._last_heading = None
        if self._skip_level is not None:
            return
        if page != self._page:
            self._flush()
            self._page = page
        if self._text:
            separator = "\n\n" if top - self._last_bottom > self._gap else " "
            self._text += separator + text
        else:
            self._text = text
        self._last_bottom = bottom

    def add_table(self, markdown: str, page: int) -> None:
        self._last_heading = None
        if self._skip_level is not None:
            return
        self._flush()
        self._page = page
        self.blocks.append(ExtractedBlock(
            text=markdown,
            location=Location(page=page),
            kind=BlockKind.TABLE,
            heading_path=self._path,
        ))

    def finish(self) -> list[ExtractedBlock]:
        self._flush()
        return self.blocks


# ----------------------------------------------------------------------
# Cargador
# ----------------------------------------------------------------------
class PdfLoader:
    kind = SourceKind.PDF

    def __init__(self, rules: PdfLayoutRules | None = None) -> None:
        self.rules = rules or PdfLayoutRules()

    def supports(self, path: Path) -> bool:
        return path.suffix.lower() == ".pdf"

    # ------------------------------------------------------------------
    # Quita las letras chicas de las franjas de margen (encabezado y pie)
    # antes de armar las lineas, para que no se mezclen con un titulo
    # cercano. Las letras grandes en el margen se conservan.
    # ------------------------------------------------------------------
    def _without_margin_text(self, page):
        footer_limit = page.height - self.rules.footer_band

        def keep(obj: dict) -> bool:
            if obj.get("object_type") != "char":
                return True
            in_margin = obj["top"] < self.rules.header_band or obj["bottom"] > footer_limit
            return not (in_margin and obj["size"] <= self.rules.margin_text_max_size)

        return page.filter(keep)

    # ------------------------------------------------------------------
    # Lectura completa: primero se detectan las lineas de margen que se
    # repiten en todo el documento, despues se procesa pagina por pagina
    # ------------------------------------------------------------------
    def load(self, path: Path) -> list[ExtractedBlock]:
        with pdfplumber.open(path) as pdf:
            pages = []
            for number, page in enumerate(pdf.pages, start=1):
                clean = self._without_margin_text(page)
                pages.append((number, clean, clean.extract_text_lines()))
            repeated = self._repeated_margin_texts(pages)
            builder = _BlockBuilder(self.rules.paragraph_gap)
            for number, page, lines in pages:
                if self._is_cover(lines) or self._is_toc(lines):
                    continue
                self._read_page(number, page, lines, repeated, builder)
            return builder.finish()

    # ------------------------------------------------------------------
    # Lineas de margen que se repiten en suficientes paginas
    # ------------------------------------------------------------------
    def _repeated_margin_texts(self, pages: list) -> set[str]:
        counter: Counter[str] = Counter()
        for _, page, lines in pages:
            for line in lines:
                if self._in_margin(line, page.height):
                    counter[normalize_line(line["text"])] += 1
        minimum = max(2, len(pages) * self.rules.repeat_ratio)
        return {text for text, count in counter.items() if count >= minimum}

    def _in_margin(self, line: dict, page_height: float) -> bool:
        return (line["top"] < self.rules.header_band
                or line["bottom"] > page_height - self.rules.footer_band)

    def _is_cover(self, lines: list[dict]) -> bool:
        return any(_line_size(line) >= self.rules.cover_min_size for line in lines)

    def _is_toc(self, lines: list[dict]) -> bool:
        return sum(1 for line in lines if is_toc_line(line["text"])) >= self.rules.toc_min_entries

    # ------------------------------------------------------------------
    # Una pagina: tablas y lineas ordenadas de arriba hacia abajo
    # ------------------------------------------------------------------
    def _read_page(self, number: int, page, lines: list[dict],
                   repeated: set[str], builder: _BlockBuilder) -> None:
        items: list[tuple[float, str, object]] = []

        # Tablas como bloques propios, en Markdown
        tables = page.find_tables()
        boxes = [table.bbox for table in tables]
        for table in tables:
            markdown = table_to_markdown(table.extract())
            if markdown:
                items.append((table.bbox[1], "table", markdown))

        # Lineas de texto que no son tabla, encabezado ni pie
        for line in lines:
            text = normalize_line(line["text"])
            if not text or any(_inside(line, box) for box in boxes):
                continue
            if self._in_margin(line, page.height) and (text in repeated or is_page_number(text)):
                continue
            items.append((line["top"], "line", line))

        for _, kind, payload in sorted(items, key=lambda item: item[0]):
            if kind == "table":
                builder.add_table(payload, number)
                continue
            text = normalize_line(payload["text"])
            level = heading_level(text, _line_size(payload), self.rules)
            if level is not None:
                builder.set_heading(level, text, payload["top"], payload["bottom"],
                                    is_ignored_section(text, self.rules))
            else:
                builder.add_line(text, number, payload["top"], payload["bottom"])
