"""Conector TOTVS Protheus: WSRESTFUL que contesta {"actualizado": bool, "mensaje": "..."}.

Protheus contesta 200 con actualizado=false cuando la peticion llego pero
no pudo afectar (por ejemplo, documento no encontrado): eso no se reintenta,
se abandona con el mensaje para que alguien lo revise.
"""
import json
from typing import Any, Dict

from app.plataformas.base import ConectorBase


class ConectorTotvs(ConectorBase):
    def interpretar(self, status: int, body: str) -> Dict[str, Any]:
        base = super().interpretar(status, body)
        if not base.get("ok"):
            return base
        try:
            data = json.loads(body) if body else {}
        except ValueError:
            data = {}
        if isinstance(data, dict) and data.get("actualizado") is False:
            return {"ok": False, "reintentar": False, "error": f"Protheus no aplicó el resultado: {data.get('mensaje') or 'sin mensaje'}"}
        return base
