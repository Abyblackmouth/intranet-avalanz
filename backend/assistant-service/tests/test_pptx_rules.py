# ----------------------------------------------------------------------
# Pruebas de las reglas de PowerPoint
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from app.pipeline.loaders.pptx_rules import ShapeText, build_slide_text, choose_title, reading_order


# ----------------------------------------------------------------------
# Orden de lectura: renglones con tolerancia, luego izquierda a derecha
# ----------------------------------------------------------------------
def test_reading_order_groups_rows():
    items = [ShapeText(100, 500, "derecha"), ShapeText(102, 10, "izquierda"), ShapeText(300, 0, "abajo")]
    assert [i.text for i in reading_order(items, row_tolerance=20)] == ["izquierda", "derecha", "abajo"]


# ----------------------------------------------------------------------
# Titulo: espacio de titulo, inferido o ninguno
# ----------------------------------------------------------------------
def test_title_from_placeholder():
    assert choose_title("Arquitectura\nde roles", ["Texto"]) == ("Arquitectura de roles", ["Texto"])


def test_title_inferred_from_first_short_text():
    assert choose_title(None, ["Claude Jurídico", "Detalle"]) == ("Claude Jurídico", ["Detalle"])
    assert choose_title(None, ["Linea uno\nLinea dos", "Detalle"]) == ("", ["Linea uno\nLinea dos", "Detalle"])


# ----------------------------------------------------------------------
# Notas del orador al final del texto
# ----------------------------------------------------------------------
def test_slide_text_with_notes():
    assert build_slide_text(["Punto uno"], "Explicacion\ncompleta") == "Punto uno\n\nNotas del orador: Explicacion completa"
    assert build_slide_text([], "Solo notas") == "Notas del orador: Solo notas"
    assert build_slide_text(["Punto uno"], None) == "Punto uno"


# ----------------------------------------------------------------------
# Adornos de diseno ("08", "A") no se toman como titulo
# ----------------------------------------------------------------------
def test_title_skips_decorations():
    assert choose_title(None, ["08", "DEMOS Y EJEMPLOS", "Detalle"]) == ("DEMOS Y EJEMPLOS", ["08", "Detalle"])
    assert choose_title(None, ["A", "PORTAL DE CONTRATOS", "Detalle"]) == ("PORTAL DE CONTRATOS", ["A", "Detalle"])
