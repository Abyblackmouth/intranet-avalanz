# ----------------------------------------------------------------------
# Cliente de la mesa de servicio (IT Service Desk)
# Catalogos y alta de incidentes con el token del usuario: el ticket
# queda a su nombre y aplican sus mismas reglas y permisos. Las imagenes
# pasan directo al IT Service Desk; este servicio no las guarda.
# ----------------------------------------------------------------------
import asyncio

import httpx

from app.domain.models import ServiceDeskUnavailable

DESK = "/api/v1/it-service-desk/mesa-de-soporte"


class HttpServiceDeskClient:
    def __init__(self, client: httpx.AsyncClient, catalog_base: str) -> None:
        self.client = client
        self.catalog_base = catalog_base

    # ------------------------------------------------------------------
    # Peticion con manejo uniforme de errores
    # ------------------------------------------------------------------
    async def _call(self, method: str, path: str, authorization: str, **kwargs) -> dict:
        try:
            response = await self.client.request(method, path, headers={"Authorization": authorization}, **kwargs)
        except httpx.HTTPError as error:
            raise ServiceDeskUnavailable(503, "mesa_no_disponible") from error
        if response.status_code not in (200, 201):
            try:
                detail = response.json().get("detail", "error")
            except ValueError:
                detail = "error"
            raise ServiceDeskUnavailable(response.status_code, str(detail))
        return response.json()

    # ------------------------------------------------------------------
    # Catalogos: sistemas activos con sus modulos, y severidades
    # ------------------------------------------------------------------
    async def catalogs(self, authorization: str) -> dict:
        systems, modules, severities = await asyncio.gather(
            self._call("GET", f"{self.catalog_base}/sistemas", authorization),
            self._call("GET", f"{self.catalog_base}/modulos", authorization),
            self._call("GET", f"{DESK}/severidades", authorization),
        )
        by_system: dict[str, list[dict]] = {}
        for m in modules.get("data", []):
            if m.get("is_active", True):
                by_system.setdefault(str(m["system_id"]), []).append({"id": str(m["id"]), "name": m["name"]})
        return {
            "systems": [
                {"id": str(s["id"]), "name": s["name"],
                 "modules": sorted(by_system.get(str(s["id"]), []), key=lambda x: x["name"])}
                for s in systems.get("data", []) if s.get("is_active", True)
            ],
            "severities": [{"id": str(s["id"]), "code": s["code"], "name": s["name"]} for s in severities.get("data", [])],
        }

    # ------------------------------------------------------------------
    # Alta de incidente: campos del formulario e imagenes opcionales
    # ------------------------------------------------------------------
    async def create_incident(self, fields: dict, files: list[tuple[str, bytes, str]], authorization: str) -> dict:
        data = {k: v for k, v in fields.items() if v}
        upload = [("files", (name, content, ctype)) for name, content, ctype in files]
        result = await self._call("POST", f"{DESK}/incidencias", authorization, data=data, files=upload or None)
        return result.get("data", {})
