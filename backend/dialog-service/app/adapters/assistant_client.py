# ----------------------------------------------------------------------
# Cliente del servicio de conocimiento
# Implementa KnowledgeClient llamando al assistant-service por la red
# interna. Reenvia el token del usuario: el RAG vuelve a validar sesion,
# modulo y piloto (defensa en profundidad).
# ----------------------------------------------------------------------
import httpx

from app.domain.models import KnowledgeUnavailable


class HttpKnowledgeClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def search(self, message: str, module: str, authorization: str) -> dict:
        try:
            response = await self.client.post("/api/v1/assistant/search",
                                               json={"question": message, "module": module},
                                               headers={"Authorization": authorization})
        except httpx.HTTPError as error:
            raise KnowledgeUnavailable(503, "conocimiento_no_disponible") from error
        if response.status_code != 200:
            try:
                detail = response.json().get("detail", "error")
            except ValueError:
                detail = "error"
            raise KnowledgeUnavailable(response.status_code, str(detail))
        return response.json()
