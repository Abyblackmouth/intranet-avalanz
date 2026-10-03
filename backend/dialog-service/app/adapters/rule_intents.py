# ----------------------------------------------------------------------
# Detector de intenciones por reglas
# Implementa IntentDetector leyendo data/intents.yaml. Solo reconoce un
# mensaje si COMPLETO es platica y no rebasa max_words.
# ----------------------------------------------------------------------
import random
import re
import unicodedata
from collections.abc import Callable, Sequence
from pathlib import Path

import yaml

from app.domain.models import IntentMatch


# ----------------------------------------------------------------------
# Texto comparable: sin acentos, sin signos, minusculas, un solo espacio
# ----------------------------------------------------------------------
def normalize(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    plain = re.sub(r"[^a-z0-9 ]+", " ", plain)
    return re.sub(r"\s+", " ", plain).strip()


class RuleIntentDetector:
    def __init__(self, definition: dict, chooser: Callable[[Sequence[str]], str] = random.choice) -> None:
        self.max_words = int(definition.get("max_words", 8))
        tail = definition.get("tail", "")
        self.chooser = chooser
        self.intents = [
            (name, [re.compile(f"(?:{p}){tail}") for p in spec["patterns"]],
             list(spec["replies"]), bool(spec.get("show_ticket", False)))
            for name, spec in definition["intents"].items()
        ]

    @classmethod
    def from_file(cls, path: str) -> "RuleIntentDetector":
        return cls(yaml.safe_load(Path(path).read_text(encoding="utf-8")))

    @property
    def size(self) -> int:
        return len(self.intents)

    def detect(self, message: str) -> IntentMatch | None:
        plain = normalize(message)
        if not plain or len(plain.split()) > self.max_words:
            return None
        for name, patterns, replies, ticket in self.intents:
            if any(pattern.fullmatch(plain) for pattern in patterns):
                return IntentMatch(intent=name, reply=self.chooser(replies), show_ticket=ticket)
        return None
