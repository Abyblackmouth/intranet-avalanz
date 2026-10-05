# ----------------------------------------------------------------------
# Privacidad de los participantes en los extractos de sesiones grabadas
# Las transcripciones de Teams traen "Nombre Apellido: texto" en cada
# intervencion. Antes de responder se quitan esas etiquetas y se reemplaza
# por "[participante]" cualquier mencion de los participantes de la sesion:
# nombre completo, primer nombre, apellidos largos y diminutivos ("Vero"
# por "Veronica"). Solo cambia lo que se muestra: la busqueda usa el texto
# completo.
# ----------------------------------------------------------------------
import re
import unicodedata

ETIQUETA = re.compile(r"^([^:\n•]{2,40}):\s*", re.M)
PALABRA = re.compile(r"\b[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]{2,}\b")
# Etiquetas que son salas o equipos de Teams, no personas
GENERICAS = {"contabilidad", "finanzas", "compras", "ventas", "nomina", "sala", "equipo", "sppel", "dyce",
             "corporativo", "avalanz", "verus", "totvs", "soporte", "sistemas", "admin", "presupuesto",
             "proyectos", "tesoreria", "capacitacion", "reunion", "grupo", "teams", "ti"}
MARCA = "[participante]"
_VOCAL = {"a": "[aáàä]", "e": "[eéèë]", "i": "[iíìï]", "o": "[oóòö]", "u": "[uúùü]", "n": "[nñ]"}


def plano(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()


def es_persona(nombre: str) -> bool:
    partes = nombre.split()
    return (2 <= len(partes) <= 5 and all(p.isalpha() for p in partes)
            and not any(plano(p) in GENERICAS for p in partes))


def participantes_de(textos: list[str]) -> list[str]:
    """Personas que hablaron, a partir de las etiquetas de la transcripcion."""
    nombres = {m.group(1).strip() for t in textos for m in ETIQUETA.finditer(t)}
    return sorted(n for n in nombres if es_persona(n))


def _patron(nombre: str) -> str:
    return r"\b" + r"\s+".join("".join(_VOCAL.get(c, re.escape(c)) for c in plano(p)) for p in nombre.split()) + r"\b"


def mask_participants(texto: str, nombres: list[str]) -> str:
    texto = ETIQUETA.sub("• ", texto)
    personas = [n for n in nombres if es_persona(n)]
    if not personas:
        return texto
    for n in sorted(personas, key=len, reverse=True):
        texto = re.sub(_patron(n), MARCA, texto, flags=re.I)
    primeros = {plano(n.split()[0]) for n in personas}
    apellidos = {plano(p) for n in personas for p in n.split()[1:] if len(p) >= 5}

    def reemplazar(m: re.Match) -> str:
        w = plano(m.group(0))
        if w in primeros or w in apellidos:
            return MARCA
        if len(w) >= 4 and any(p.startswith(w) and p != w for p in primeros):
            return MARCA
        return m.group(0)

    texto = PALABRA.sub(reemplazar, texto)
    return re.sub(r"(\[participante\][\s,]*){2,}", MARCA + " ", texto)
