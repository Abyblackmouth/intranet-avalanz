# ----------------------------------------------------------------------
# Utilidades compartidas por los cargadores
# Limpieza de lineas, secciones que se ignoran y conversion de tablas a
# Markdown. Funciones puras, sin dependencias externas.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import re
from collections.abc import Sequence

# ----------------------------------------------------------------------
# Secciones sin contenido util que se descartan completas
# Se comparan en minusculas y sin numeracion.
# ----------------------------------------------------------------------
DEFAULT_IGNORED_SECTIONS: tuple[str, ...] = (
    "contenido",
    "control de versiones",
    "índice",
    "indice",
    "tabla de contenido",
)


# ----------------------------------------------------------------------
# Limpieza de una linea: espacios y saltos compactados
# ----------------------------------------------------------------------
def normalize_line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# ----------------------------------------------------------------------
# Titulo ignorado: se compara sin numeracion y en minusculas
# ----------------------------------------------------------------------
def is_ignored_title(text: str, ignored: Sequence[str] = DEFAULT_IGNORED_SECTIONS) -> bool:
    title = re.sub(r"^\d+(?:\.\d+)*\.?\s+", "", normalize_line(text)).lower()
    return title in ignored


# ----------------------------------------------------------------------
# Tabla a Markdown
# Las celdas combinadas llegan como None en las columnas que cubren. Una
# columna que en las filas de datos solo tiene None o vacio es
# continuacion de la anterior y se une a ella. Despues se omiten filas y
# columnas vacias, y cada celda queda en una sola linea.
# ----------------------------------------------------------------------
def table_to_markdown(rows: Sequence[Sequence[object]] | None) -> str:
    rows = [list(row) for row in rows or []]
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    body = rows[1:]

    # Columnas de continuacion: cubiertas por una celda combinada
    continuation = {
        j for j in range(1, width)
        if any(row[j] is None for row in rows)
        and not any(row[j] not in (None, "") for row in body)
    }
    groups: list[list[int]] = []
    for j in range(width):
        if j in continuation and groups:
            groups[-1].append(j)
        else:
            groups.append([j])

    # Cada grupo de columnas se convierte en una sola celda
    merged = [
        [normalize_line(" ".join(str(row[j]) for j in group if row[j] not in (None, "")))
         for group in groups]
        for row in rows
    ]
    cleaned = [row for row in merged if any(row)]
    if not cleaned:
        return ""

    # Columnas vacias en todas las filas se omiten
    keep = [i for i in range(len(groups)) if any(row[i] for row in cleaned)]
    cleaned = [[row[i] for i in keep] for row in cleaned]
    header, *body_rows = cleaned
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * len(keep)) + " |"]
    lines += ["| " + " | ".join(row) + " |" for row in body_rows]
    return "\n".join(lines)
