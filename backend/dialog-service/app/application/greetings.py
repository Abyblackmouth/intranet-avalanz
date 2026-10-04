# ----------------------------------------------------------------------
# Saludo al inicio del mensaje
# "Hola, que eres?" debe reconocerse como platica, y "hola, donde veo los
# saldos?" debe buscarse SIN el saludo: las transcripciones estan llenas de
# saludos ("Hola Vero", "Hola Renato") y la palabra "hola" las atraia.
# Despues del saludo se limpian comas y signos de cierre, pero NO el signo
# de apertura de la pregunta ("¿").
# ----------------------------------------------------------------------
import re

_SALUDO = re.compile(
    r"^\s*[¡!]*\s*(?:hola+|hey|saludos|buen\s+d[ií]a|buen[oa]s\s+(?:d[ií]as|tardes|noches)|buenas|qu[eé]\s+tal)\b"
    r"[\s,.;:!¡?]*",
    re.IGNORECASE,
)


def strip_greeting(message: str) -> str:
    """Quita uno o mas saludos del inicio; si no queda nada, regresa el mensaje original."""
    resto = message
    for _ in range(3):
        nuevo = _SALUDO.sub("", resto, count=1)
        if nuevo == resto:
            break
        resto = nuevo
    return resto.strip() or message
