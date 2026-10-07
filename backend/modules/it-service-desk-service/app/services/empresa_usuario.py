"""Empresa real de un usuario, segun su perfil en admin-service.

La sesion trae una lista "companies" con varias empresas, y la primera es
siempre AVALANZ: no sirve para saber a que empresa pertenece la persona.
Esta funcion es la fuente confiable para guardar la empresa de un ticket y
para el filtro de Jefe Empresa. Si admin-service no responde, devuelve None
y quien llama decide cerrar (nunca abrir de mas).
"""
from typing import Optional

import httpx


async def empresa_de(user_id) -> Optional[str]:
    if not user_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"http://admin-service:8000/internal/users/{user_id}/profile")
            if r.status_code == 200:
                d = r.json()
                cid = d.get("company_id") or (d.get("company") or {}).get("id")
                return str(cid) if cid else None
    except httpx.HTTPError:
        pass
    return None
