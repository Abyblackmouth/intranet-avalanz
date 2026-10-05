# ----------------------------------------------------------------------
# Participantes de cada sesion grabada
# Lee las etiquetas de toda la transcripcion la primera vez y guarda la
# lista en memoria (el asistente se reinicia despues de cada ingesta).
# ----------------------------------------------------------------------
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.application.privacy import participantes_de


class PgParticipants:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.cache: dict[str, list[str]] = {}

    async def names(self, relative_path: str) -> list[str]:
        if relative_path not in self.cache:
            query = text("SELECT c.text FROM chunks c JOIN documents d ON d.id = c.document_id "
                         "WHERE d.relative_path = :p AND c.kind = 'speech'")
            async with self.engine.connect() as connection:
                textos = [row[0] for row in await connection.execute(query, {"p": relative_path})]
            self.cache[relative_path] = participantes_de(textos)
        return self.cache[relative_path]
