# ----------------------------------------------------------------------
# Reglas de lectura de Word
# Funciones puras para interpretar estilos y tablas de un .docx. No
# dependen de python-docx, asi que se prueban sin abrir ningun archivo.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import re
from collections.abc import Sequence

# ----------------------------------------------------------------------
# Estilos de titulo
# Acepta el nombre visible ("Heading 2", "Título 1") y el identificador
# interno del XML ("Heading2", "Ttulo1"), que es lo unico disponible
# cuando el documento fue generado sin definir sus estilos.
# ----------------------------------------------------------------------
HEADING_STYLE = re.compile(r"^(?:heading|t[ií]tulo|ttulo)\s*(\d)$", re.IGNORECASE)

# Palabras que identifican un estilo de lista (vinetas o numeracion)
LIST_STYLE_WORDS = ("list", "lista")


# ----------------------------------------------------------------------
# Nivel de titulo segun el estilo; None si no es titulo
# ----------------------------------------------------------------------
def heading_level_from_style(style: str | None) -> int | None:
    if not style:
        return None
    match = HEADING_STYLE.match(style.strip())
    return int(match.group(1)) if match else None


# ----------------------------------------------------------------------
# Estilo de lista: el parrafo se conserva con un guion al inicio
# ----------------------------------------------------------------------
def is_list_style(style: str | None) -> bool:
    return bool(style) and any(word in style.lower() for word in LIST_STYLE_WORDS)


# ----------------------------------------------------------------------
# Celdas combinadas en Word
# python-docx repite la misma celda en cada columna que abarca. Se
# conserva una sola vez cada celda consecutiva con el mismo identificador.
# ----------------------------------------------------------------------
def dedupe_merged_cells(cells: Sequence[tuple[object, str]]) -> list[str]:
    texts: list[str] = []
    previous: object = object()
    for cell_id, text in cells:
        if cell_id == previous:
            continue
        previous = cell_id
        texts.append(text)
    return texts
