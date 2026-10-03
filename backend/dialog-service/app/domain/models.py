# ----------------------------------------------------------------------
# Modelos del dominio del dialogo
# ----------------------------------------------------------------------
from dataclasses import dataclass


# ----------------------------------------------------------------------
# Intencion reconocida con su respuesta
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class IntentMatch:
    intent: str
    reply: str
    show_ticket: bool = False


# ----------------------------------------------------------------------
# El servicio de conocimiento respondio con error o no respondio.
# La API lo traduce al mismo estado HTTP (403, 503...).
# ----------------------------------------------------------------------
class KnowledgeUnavailable(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail
