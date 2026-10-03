# ----------------------------------------------------------------------
# Reglas de lectura de PDF
# Umbrales y funciones puras para interpretar la estructura de un PDF:
# titulos, indice, encabezado, pie y tablas. No dependen de pdfplumber,
# asi que se prueban sin abrir ningun archivo. Los valores por defecto
# estan calibrados con los manuales de autocapacitacion de TOTVS V25.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import re
from dataclasses import dataclass

# normalize_line y table_to_markdown se re-exportan para quien las importe desde aqui
from app.pipeline.loaders.common import (
    DEFAULT_IGNORED_SECTIONS,
    normalize_line,
    table_to_markdown,
)


# ----------------------------------------------------------------------
# Umbrales de la plantilla
# Todos en un solo lugar: si llega un manual con otra plantilla, se
# ajustan aqui sin tocar la logica. Medidas en puntos (pt).
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class PdfLayoutRules:
    # Tamano minimo para considerar una linea como titulo (texto normal: 10.6)
    heading_min_size: float = 12.5
    # Tamano minimo de un titulo de seccion (nivel 1: 16; subseccion: 13)
    section_min_size: float = 15.5
    # Tamano que solo aparece en la portada (26 y 17)
    cover_min_size: float = 24.0
    # Franjas de margen: encabezado (top 46, y 55 si ocupa dos lineas) y pie (bottom 757)
    header_band: float = 60.0
    footer_band: float = 45.0
    # Proporcion de paginas en que una linea de margen debe repetirse
    repeat_ratio: float = 0.5
    # Lineas con puntos guia a partir de las cuales una pagina es indice
    toc_min_entries: int = 5
    # Espacio vertical que separa un parrafo del siguiente
    paragraph_gap: float = 6.0
    # Letra maxima del texto de margen (encabezado y pie miden 8)
    margin_text_max_size: float = 9.0
    # Secciones sin contenido util que se descartan completas
    ignored_sections: tuple[str, ...] = DEFAULT_IGNORED_SECTIONS


# ----------------------------------------------------------------------
# Patrones de texto
# Entrada de indice ("5.9.1 Incidencias ...... 18"), numero de pagina
# ("Pagina 3 de 27") y numeracion de seccion ("5.9.1 Incidencias").
# ----------------------------------------------------------------------
TOC_LINE = re.compile(r"\.{5,}\s*\d+\s*$")
PAGE_NUMBER = re.compile(r"^p[aá]gina\s+\d+(\s+de\s+\d+)?$", re.IGNORECASE)
SECTION_NUMBER = re.compile(r"^(\d+(?:\.\d+)*)\.?\s+\S")


# ----------------------------------------------------------------------
# Deteccion de entradas de indice y de numeros de pagina
# ----------------------------------------------------------------------
def is_toc_line(text: str) -> bool:
    return bool(TOC_LINE.search(text))


def is_page_number(text: str) -> bool:
    return bool(PAGE_NUMBER.match(normalize_line(text)))


# ----------------------------------------------------------------------
# Nivel de un titulo
# None si la linea no es titulo. Si trae numeracion, el nivel es la
# cantidad de numeros (5.9.1 es nivel 3); si no, se decide por tamano.
# ----------------------------------------------------------------------
def heading_level(text: str, size: float, rules: PdfLayoutRules) -> int | None:
    if size < rules.heading_min_size:
        return None
    numbering = SECTION_NUMBER.match(normalize_line(text))
    if numbering:
        return numbering.group(1).count(".") + 1
    return 1 if size >= rules.section_min_size else 2


# ----------------------------------------------------------------------
# Secciones ignoradas
# Compara el titulo sin numeracion y en minusculas contra la lista de
# secciones que no aportan contenido (indice, control de versiones).
# ----------------------------------------------------------------------
def is_ignored_section(text: str, rules: PdfLayoutRules) -> bool:
    title = re.sub(r"^\d+(?:\.\d+)*\.?\s+", "", normalize_line(text)).lower()
    return title in rules.ignored_sections
