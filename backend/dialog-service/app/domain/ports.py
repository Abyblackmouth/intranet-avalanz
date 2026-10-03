# ----------------------------------------------------------------------
# Puertos del dialogo
# IntentDetector: hoy reglas en YAML; manana un conjunto de datos o un
# modelo. KnowledgeClient: hoy el assistant-service por HTTP.
# ----------------------------------------------------------------------
from typing import Protocol

from app.domain.models import IntentMatch


class IntentDetector(Protocol):
    def detect(self, message: str) -> IntentMatch | None: ...


class KnowledgeClient(Protocol):
    async def search(self, message: str, module: str, authorization: str) -> dict: ...
