# ----------------------------------------------------------------------
# Caso de uso: atender un mensaje del usuario
# Si es platica basica, responde sin consultar el conocimiento. Si no,
# lo consulta. Ambas respuestas tienen el mismo formato para el widget.
# ----------------------------------------------------------------------
from app.domain.ports import IntentDetector, KnowledgeClient


class HandleMessage:
    def __init__(self, detector: IntentDetector, knowledge: KnowledgeClient) -> None:
        self.detector = detector
        self.knowledge = knowledge

    async def run(self, message: str, module: str, authorization: str) -> dict:
        match = self.detector.detect(message)
        if match:
            return {"type": "conversacion", "intent": match.intent, "reply": match.reply,
                    "show_ticket": match.show_ticket, "confidence": "conversacion", "overlap": 0, "results": []}
        data = await self.knowledge.search(message, module, authorization)
        return {**data, "type": "busqueda", "intent": None, "reply": None, "show_ticket": False}
