"""Conector generico: POST JSON a {url_base}/{resultService}/ con la autenticacion de la conexion."""
import json
import logging
from typing import Any, Dict, Optional, Tuple

import httpx

from app.models import Conexion, Instancia
from app.services.ajustes.conexiones_service import credenciales_salida

logger = logging.getLogger("avalanz")


class ConectorBase:
    def __init__(self, conexion: Conexion):
        self.conexion = conexion

    def url_resultado(self, inst: Instancia) -> str:
        return f"{self.conexion.url_base.rstrip('/')}/{(inst.result_service or '').strip('/')}/"

    def autenticacion(self) -> Tuple[Dict[str, str], Optional[Tuple[str, str]]]:
        cred = credenciales_salida(self.conexion)
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        auth = None
        if cred["tipo"] == "basica" and cred["usuario"]:
            auth = (cred["usuario"], cred["secreto"] or "")
        elif cred["tipo"] == "token" and cred["secreto"]:
            headers["Authorization"] = f"Bearer {cred['secreto']}"
        return headers, auth

    def interpretar(self, status: int, body: str) -> Dict[str, Any]:
        """Que significa la respuesta. 2xx = aplicado; 4xx = no reintentar; 5xx = reintentar."""
        mensaje = None
        try:
            data = json.loads(body) if body else {}
            if isinstance(data, dict):
                mensaje = data.get("mensaje") or data.get("message") or data.get("msg")
        except ValueError:
            data = {}
        if 200 <= status < 300:
            return {"ok": True, "mensaje": mensaje}
        if 400 <= status < 500:
            return {"ok": False, "reintentar": False, "error": f"La plataforma rechazó el resultado (HTTP {status}): {mensaje or body[:200]}"}
        return {"ok": False, "reintentar": True, "error": f"La plataforma falló (HTTP {status}): {mensaje or body[:200]}"}

    async def enviar_resultado(self, inst: Instancia, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not inst.result_service:
            return {"ok": False, "reintentar": False, "status": None, "body": "", "error": "El trámite no tiene resultService: no sé a qué servicio de la plataforma mandarlo"}
        url = self.url_resultado(inst)
        headers, auth = self.autenticacion()
        try:
            async with httpx.AsyncClient(timeout=self.conexion.timeout_seg or 20, verify=False) as client:
                r = await client.post(url, headers=headers, auth=auth, content=json.dumps(payload, default=str))
            res = self.interpretar(r.status_code, r.text)
            return {**res, "status": r.status_code, "body": r.text}
        except httpx.TimeoutException:
            return {"ok": False, "reintentar": True, "status": None, "body": "", "error": f"Sin respuesta en {self.conexion.timeout_seg} s"}
        except Exception as e:
            return {"ok": False, "reintentar": True, "status": None, "body": "", "error": f"No se pudo conectar: {type(e).__name__}: {e}"[:300]}
