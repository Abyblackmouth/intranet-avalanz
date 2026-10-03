# ----------------------------------------------------------------------
# Sugerencia del tipo de ticket por palabras clave
# Lee data/ticket_types.yaml. Es solo una sugerencia: el usuario decide.
# ----------------------------------------------------------------------
import re
from pathlib import Path

import yaml

from app.adapters.rule_intents import normalize


class KeywordTicketClassifier:
    def __init__(self, definition: dict) -> None:
        self.default = definition.get("default", "funcional")
        self.keywords = {kind: [normalize(k) for k in definition.get(kind, [])] for kind in ("tecnico", "funcional")}

    @classmethod
    def from_file(cls, path: str) -> "KeywordTicketClassifier":
        return cls(yaml.safe_load(Path(path).read_text(encoding="utf-8")))

    def _found(self, plain: str, kind: str) -> list[str]:
        return [k for k in self.keywords[kind] if re.search(rf"\b{re.escape(k)}\b", plain)]

    def suggest(self, text: str) -> dict:
        plain = normalize(text)
        tecnico, funcional = self._found(plain, "tecnico"), self._found(plain, "funcional")
        if tecnico and len(tecnico) >= len(funcional):
            return {"reported_type": "tecnico", "keywords": tecnico}
        if funcional:
            return {"reported_type": "funcional", "keywords": funcional}
        return {"reported_type": self.default, "keywords": []}
