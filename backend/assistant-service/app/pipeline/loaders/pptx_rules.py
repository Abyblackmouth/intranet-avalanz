# ----------------------------------------------------------------------
# Reglas de lectura de PowerPoint
# Funciones puras para ordenar los cuadros de texto de una diapositiva,
# elegir su titulo y armar su texto con las notas del orador. No
# dependen de python-pptx, asi que se prueban sin abrir ningun archivo.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from collections.abc import Sequence
from dataclasses import dataclass

from app.pipeline.loaders.common import normalize_line

# ----------------------------------------------------------------------
# Umbrales
# PowerPoint mide posiciones en EMU (914,400 por pulgada). Dos cuadros
# con menos de 0.15 pulgadas (~0.4 cm) de diferencia en altura se leen
# como el mismo renglon. Un titulo inferido no pasa de 90 caracteres.
# ----------------------------------------------------------------------
ROW_TOLERANCE_EMU = 137_160
MAX_INFERRED_TITLE = 90
# Un titulo inferido necesita al menos 4 letras (descarta adornos como "08" o "A")
MIN_TITLE_LETTERS = 4
# Cuadros que se revisan como posible titulo
TITLE_CANDIDATES = 3
NOTES_LABEL = "Notas del orador:"


# ----------------------------------------------------------------------
# Cuadro de texto con su posicion en la diapositiva
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class ShapeText:
    top: int
    left: int
    text: str


# ----------------------------------------------------------------------
# Orden de lectura: renglones de arriba hacia abajo y, dentro de cada
# renglon, de izquierda a derecha
# ----------------------------------------------------------------------
def reading_order(items: Sequence[ShapeText], row_tolerance: int = ROW_TOLERANCE_EMU) -> list[ShapeText]:
    rows: list[list[ShapeText]] = []
    for item in sorted(items, key=lambda i: (i.top, i.left)):
        if rows and abs(item.top - rows[-1][0].top) <= row_tolerance:
            rows[-1].append(item)
        else:
            rows.append([item])
    return [item for row in rows for item in sorted(row, key=lambda i: i.left)]


# ----------------------------------------------------------------------
# Titulo de la diapositiva
# El del espacio de titulo si existe. Si no, se revisan los primeros
# cuadros en orden de lectura: los adornos (menos de 4 letras, como "08"
# o "A") se saltan; el primer texto de una sola linea y corto es el
# titulo; un parrafo largo o de varias lineas detiene la busqueda, porque
# es cuerpo. Regresa el titulo y los textos restantes.
# ----------------------------------------------------------------------
def choose_title(placeholder: str | None, texts: Sequence[str],
                 max_length: int = MAX_INFERRED_TITLE,
                 min_letters: int = MIN_TITLE_LETTERS,
                 candidates: int = TITLE_CANDIDATES) -> tuple[str, list[str]]:
    title = normalize_line(placeholder or "")
    if title:
        return title, list(texts)
    for index, text in enumerate(texts[:candidates]):
        if "\n" in text or len(text) > max_length:
            break
        if sum(char.isalpha() for char in text) < min_letters:
            continue
        return text, list(texts[:index]) + list(texts[index + 1:])
    return "", list(texts)


# ----------------------------------------------------------------------
# Texto de la diapositiva: cuerpo en orden de lectura y, al final, las
# notas del orador marcadas como tales
# ----------------------------------------------------------------------
def build_slide_text(texts: Sequence[str], notes: str | None) -> str:
    body = "\n".join(text for text in texts if text)
    notes = normalize_line(notes or "")
    if not notes:
        return body
    return f"{body}\n\n{NOTES_LABEL} {notes}" if body else f"{NOTES_LABEL} {notes}"
