# ----------------------------------------------------------------------
# Caso de uso: atender un mensaje del usuario
# Si es platica basica, responde sin consultar el conocimiento. Si no,
# lo consulta. Ambas respuestas tienen el mismo formato para el widget.
# ----------------------------------------------------------------------
from app.application.greetings import strip_greeting
from app.domain.ports import IntentDetector, KnowledgeClient


class HandleMessage:
    def __init__(self, detector: IntentDetector, knowledge: KnowledgeClient) -> None:
        self.detector = detector
        self.knowledge = knowledge

    async def run(self, message: str, module: str, authorization: str) -> dict:
        # Un saludo al inicio no convierte el mensaje en busqueda: se reconoce la
        # intencion del resto, y si es una pregunta se busca sin el saludo
        rest = strip_greeting(message)
        match = self.detector.detect(message) or (self.detector.detect(rest) if rest != message else None)
        if match:
            return {"type": "conversacion", "intent": match.intent, "reply": match.reply,
                    "show_ticket": match.show_ticket, "action": match.action,
                    "confidence": "conversacion", "overlap": 0, "results": []}
        data = await self.knowledge.search(rest, module, authorization)
        return {**data, "type": "busqueda", "intent": None, "reply": None, "show_ticket": False, "action": None}
