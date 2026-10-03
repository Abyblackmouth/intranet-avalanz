# ----------------------------------------------------------------------
# Sugerencias para el ticket
# Tipo (funcional o tecnico) por palabras clave, y sistema segun el tema
# de los documentos que el asistente mostro. Lee data/ticket_types.yaml.
# Son solo sugerencias: el usuario decide.
# ----------------------------------------------------------------------
import re
from collections.abc import Sequence
from pathlib import Path

import yaml

from app.adapters.rule_intents import normalize


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(text)).strip("-")


class KeywordTicketClassifier:
    def __init__(self, definition: dict) -> None:
        self.default = definition.get("default", "funcional")
        self.keywords = {kind: [normalize(k) for k in definition.get(kind, [])] for kind in ("tecnico", "funcional")}
        self.systems_by_topic = {slug(k): v for k, v in (definition.get("systems_by_topic") or {}).items()}

    @classmethod
    def from_file(cls, path: str) -> "KeywordTicketClassifier":
        return cls(yaml.safe_load(Path(path).read_text(encoding="utf-8")))

    def _found(self, plain: str, kind: str) -> list[str]:
        return [k for k in self.keywords[kind] if re.search(rf"\b{re.escape(k)}\b", plain)]

    def suggest(self, text: str, topics: Sequence[str] = ()) -> dict:
        plain = normalize(text)
        tecnico, funcional = self._found(plain, "tecnico"), self._found(plain, "funcional")
        if tecnico and len(tecnico) >= len(funcional):
            result = {"reported_type": "tecnico", "keywords": tecnico}
        elif funcional:
            result = {"reported_type": "funcional", "keywords": funcional}
        else:
            result = {"reported_type": self.default, "keywords": []}
        # Sistema mas frecuente entre los temas con equivalencia
        systems = [s for s in (self.systems_by_topic.get(slug(t)) for t in topics) if s]
        result["system"] = max(set(systems), key=systems.count) if systems else None
        return result
