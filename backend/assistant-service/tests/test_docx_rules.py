# ----------------------------------------------------------------------
# Pruebas de las reglas de Word y de las utilidades compartidas
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from app.pipeline.loaders.common import is_ignored_title
from app.pipeline.loaders.docx_rules import dedupe_merged_cells, heading_level_from_style, is_list_style


# ----------------------------------------------------------------------
# Titulos por estilo: nombre visible o identificador interno
# ----------------------------------------------------------------------
def test_heading_level_from_style():
    assert heading_level_from_style("Heading 2") == 2
    assert heading_level_from_style("Heading2") == 2
    assert heading_level_from_style("Título 1") == 1
    assert heading_level_from_style("Ttulo3") == 3
    assert heading_level_from_style("List Paragraph") is None
    assert heading_level_from_style(None) is None


# ----------------------------------------------------------------------
# Listas
# ----------------------------------------------------------------------
def test_list_style():
    assert is_list_style("List Paragraph")
    assert is_list_style("Lista con viñetas")
    assert not is_list_style("Normal")
    assert not is_list_style(None)


# ----------------------------------------------------------------------
# Celdas combinadas: la misma celda repetida se conserva una vez
# ----------------------------------------------------------------------
def test_dedupe_merged_cells():
    assert dedupe_merged_cells([(1, "Rol"), (1, "Rol"), (2, "Participante")]) == ["Rol", "Participante"]


# ----------------------------------------------------------------------
# Secciones ignoradas compartidas, incluido el indice de Word
# ----------------------------------------------------------------------
def test_ignored_title():
    assert is_ignored_title("Índice")
    assert is_ignored_title("Control de versiones")
    assert not is_ignored_title("3. Índice de reportes")
