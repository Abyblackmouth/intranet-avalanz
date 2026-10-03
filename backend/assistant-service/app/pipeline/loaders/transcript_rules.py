# ----------------------------------------------------------------------
# Reglas de lectura de transcripciones de Teams
# Funciones puras para reconocer una intervencion ("Nombre  m:ss Texto"),
# convertir su hora a segundos y limpiar el texto. No dependen de
# python-docx, asi que se prueban sin abrir ningun archivo.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import re
from dataclasses import dataclass

# ----------------------------------------------------------------------
# Patron de una intervencion
# Nombre sin digitos, separado de la hora por espacios, tabuladores o
# saltos de linea; despues el texto, que puede ocupar varias lineas.
# Validado contra transcripciones reales en la prueba de Whisper.
# ----------------------------------------------------------------------
TEAMS_TURN = re.compile(
    r"^(?P<speaker>[^\d\n\t]+?)[ \t\n]+(?P<time>\d{1,2}:\d{2}(?::\d{2})?)\s*(?P<text>.*)$",
    re.DOTALL,
)

# Teams pega oraciones sin espacio ("Sí.Claro."): punto seguido de mayuscula
MISSING_SPACE = re.compile(r"([.?!])(?=[A-ZÁÉÍÓÚÑ¿¡])")


# ----------------------------------------------------------------------
# Intervencion reconocida
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class TeamsTurn:
    speaker: str
    seconds: int
    text: str


# ----------------------------------------------------------------------
# Hora de Teams (m:ss o h:mm:ss) a segundos
# ----------------------------------------------------------------------
def timestamp_to_seconds(value: str) -> int:
    total = 0
    for part in value.split(":"):
        total = total * 60 + int(part)
    return total


# ----------------------------------------------------------------------
# Limpieza del texto: espacios compactados y espacio despues de punto
# ----------------------------------------------------------------------
def clean_turn_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return MISSING_SPACE.sub(r"\1 ", text)


# ----------------------------------------------------------------------
# Un parrafo de la transcripcion a intervencion
# None si el parrafo no es una intervencion (titulo, fecha, duracion,
# avisos de Teams) o si la intervencion no tiene texto.
# ----------------------------------------------------------------------
def parse_teams_paragraph(text: str) -> TeamsTurn | None:
    match = TEAMS_TURN.match(text.strip())
    if not match:
        return None
    body = clean_turn_text(match["text"])
    if not body:
        return None
    speaker = re.sub(r"\s+", " ", match["speaker"]).strip()
    return TeamsTurn(speaker=speaker, seconds=timestamp_to_seconds(match["time"]), text=body)
