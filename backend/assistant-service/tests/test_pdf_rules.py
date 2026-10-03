# ----------------------------------------------------------------------
# Pruebas de las reglas de lectura de PDF
# Funciones puras: no abren ningun archivo ni requieren pdfplumber.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from app.pipeline.loaders.pdf_rules import (
    PdfLayoutRules,
    heading_level,
    is_ignored_section,
    is_page_number,
    is_toc_line,
    table_to_markdown,
)

RULES = PdfLayoutRules()


# ----------------------------------------------------------------------
# Titulos: la numeracion manda; sin numeracion, el tamano
# ----------------------------------------------------------------------
def test_heading_level_by_numbering_depth():
    assert heading_level("5.9.1 Incidencias", 13.0, RULES) == 3


def test_heading_level_section():
    assert heading_level("1. Introducción y objetivo del manual", 16.0, RULES) == 1


def test_heading_level_without_number_uses_size():
    assert heading_level("Preguntas frecuentes", 16.0, RULES) == 1
    assert heading_level("Notas importantes", 13.0, RULES) == 2


def test_body_text_is_not_heading():
    assert heading_level("1 de cada 3 empleados registra incidencias", 10.6, RULES) is None


# ----------------------------------------------------------------------
# Indice y numero de pagina
# ----------------------------------------------------------------------
def test_toc_line():
    assert is_toc_line("5.9.1 Incidencias .......................... 18")
    assert not is_toc_line("El calculo se realiza al cierre del periodo.")


def test_page_number():
    assert is_page_number("Página 3 de 27")
    assert is_page_number("Pagina 4")
    assert not is_page_number("Paginación de reportes")


# ----------------------------------------------------------------------
# Tablas a Markdown
# ----------------------------------------------------------------------
def test_table_to_markdown():
    rows = [["Campo", "Valor"], [None, "x\ny"], ["", ""]]
    assert table_to_markdown(rows) == "| Campo | Valor |\n| --- | --- |\n|  | x y |"


def test_table_to_markdown_empty():
    assert table_to_markdown([]) == ""
    assert table_to_markdown([[None, None]]) == ""


# ----------------------------------------------------------------------
# Columnas vacias y secciones ignoradas
# ----------------------------------------------------------------------
def test_table_drops_empty_columns():
    rows = [["", "Versión", "", "Fecha"], ["", "1.0", "", "2026-09-01"]]
    assert table_to_markdown(rows) == "| Versión | Fecha |\n| --- | --- |\n| 1.0 | 2026-09-01 |"


def test_ignored_sections():
    assert is_ignored_section("Contenido", RULES)
    assert is_ignored_section("Control de versiones", RULES)
    assert not is_ignored_section("2. Contenido del módulo", RULES)
    assert not is_ignored_section("1. Introducción", RULES)


# ----------------------------------------------------------------------
# Celdas combinadas: tres columnas fisicas por cada columna real
# ----------------------------------------------------------------------
def test_table_merged_cells():
    rows = [
        ["", "Rol", "", "", "Participante", ""],
        ["Instructor", None, None, "Andrés Hernández", None, None],
    ]
    assert table_to_markdown(rows) == "| Rol | Participante |\n| --- | --- |\n| Instructor | Andrés Hernández |"
