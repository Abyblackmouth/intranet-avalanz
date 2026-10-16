"""Panel de Ajustes del IT Service Desk (solo super admin).

Los valores viven en incidencias_settings (clave/valor en texto), que ya leen
los modulos con _get_setting. Este catalogo define cada ajuste: su grupo, su
explicacion, su tipo y sus valores validos. La pantalla se dibuja a partir de
el, asi que un ajuste nuevo es una entrada mas aqui."""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routes.mesa_de_soporte.mesa_de_soporte import get_current_user

router = APIRouter(prefix="/ajustes")  # el registro del submódulo no le pone prefijo

AJUSTES = [
    {"key": "acc.metodo_firma", "grupo": "Control de accesos", "label": "Método de firma",
     "descripcion": "Cómo se firma el formato de alta. Manual: se envía el PDF para imprimir, firmar y subir escaneado. DocuSign: se firma en línea.",
     "tipo": "opcion", "default": "manual", "opciones": [["manual", "Manual"], ["docusign", "DocuSign"]]},
    {"key": "acc.docusign_ambiente", "grupo": "Control de accesos", "label": "Ambiente de DocuSign",
     "descripcion": "En Pruebas, los documentos llevan la leyenda \"DOCUMENTO DE PRUEBA · SIN VALIDEZ\". Solo aplica si el método de firma es DocuSign.",
     "tipo": "opcion", "default": "pruebas", "opciones": [["pruebas", "Pruebas"], ["produccion", "Producción"]]},
    {"key": "cdc.dias_garantia", "grupo": "Control de Cambios", "label": "Días de garantía",
     "descripcion": "Días que un Control de Cambios permanece en Terminado después del paso a producción, antes de cerrarse solo.",
     "tipo": "int", "default": "15", "min": 1, "max": 180},
    {"key": "cdc.permitir_documento_propio", "grupo": "Control de Cambios", "label": "Permitir documento propio en el Arranque",
     "descripcion": "Si está activo, el Project Manager puede subir su propio documento (por ejemplo, su propia acta) en lugar de llenar el formato del sistema.",
     "tipo": "bool", "default": "false"},
    {"key": "mesa.menciones_excluidos", "grupo": "Mesa de Soporte", "label": "Excluir de las menciones",
     "descripcion": "Incident Managers que no aparecen al escribir @ en la conversación (por ejemplo, directores o dueños con acceso temporal). Si ya participan en la conversación de un ticket, ahí sí se les puede mencionar.",
     "tipo": "usuarios", "default": "[]", "fuente": "incident-managers"},
]
POR_KEY = {a["key"]: a for a in AJUSTES}


def _solo_super_admin(user: dict) -> None:
    if "super_admin" not in set(user.get("roles") or []) and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Solo el super admin puede ver o cambiar los ajustes")


def _normalizar(ajuste: dict, valor) -> str:
    tipo = ajuste["tipo"]
    if tipo == "bool":
        if isinstance(valor, bool):
            return "true" if valor else "false"
        if str(valor).lower() in ("true", "false"):
            return str(valor).lower()
        raise HTTPException(status_code=422, detail="El valor debe ser verdadero o falso")
    if tipo == "int":
        try:
            n = int(valor)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="El valor debe ser un número entero")
        if not ajuste.get("min", n) <= n <= ajuste.get("max", n):
            raise HTTPException(status_code=422, detail=f"El valor debe estar entre {ajuste['min']} y {ajuste['max']}")
        return str(n)
    if tipo == "opcion":
        validos = [o[0] for o in ajuste["opciones"]]
        if str(valor) not in validos:
            raise HTTPException(status_code=422, detail=f"Opción no válida. Opciones: {', '.join(validos)}")
        return str(valor)
    if tipo == "usuarios":
        lista = valor
        if isinstance(valor, str):
            try:
                lista = json.loads(valor or "[]")
            except ValueError:
                raise HTTPException(status_code=422, detail="La lista de personas no es válida")
        if not isinstance(lista, list) or len(lista) > 100:
            raise HTTPException(status_code=422, detail="La lista de personas no es válida")
        limpia = {}
        for x in lista:
            pid = str(x.get("id") if isinstance(x, dict) else x).strip()
            if pid:
                limpia[pid] = {"id": pid, "nombre": str(x.get("nombre", "")) if isinstance(x, dict) else ""}
        return json.dumps(sorted(limpia.values(), key=lambda p: p["nombre"]), ensure_ascii=False)
    raise HTTPException(status_code=500, detail="Tipo de ajuste desconocido")


async def _valores(db: AsyncSession) -> dict:
    res = await db.execute(text("SELECT key, value FROM incidencias_settings"))
    return {k: v for k, v in res.all()}


@router.get("")
async def listar_ajustes(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _solo_super_admin(user)
    actuales = await _valores(db)
    return [{**a, "valor": actuales.get(a["key"], a["default"])} for a in AJUSTES]


@router.get("/opciones/{fuente}")
async def opciones_ajuste(fuente: str, user: dict = Depends(get_current_user)):
    """Opciones para los ajustes de tipo "usuarios"."""
    _solo_super_admin(user)
    if fuente != "incident-managers":
        raise HTTPException(status_code=404, detail="Fuente no encontrada")
    from app.routes.mesa_de_soporte.comentarios import _incident_managers
    ims = await _incident_managers()
    return sorted(({"id": k, "nombre": v["nombre"], "bloqueado": v["bloqueado"]} for k, v in ims.items()), key=lambda x: x["nombre"])


@router.get("/historial")
async def historial_ajustes(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _solo_super_admin(user)
    res = await db.execute(text(
        "SELECT key, valor_anterior, valor_nuevo, usuario_nombre, created_at FROM ajustes_historial ORDER BY created_at DESC LIMIT 30"))
    return [{"key": k, "label": POR_KEY.get(k, {}).get("label", k), "anterior": a, "nuevo": n, "usuario": u, "fecha": f.isoformat()}
            for k, a, n, u, f in res.all()]


class CambioAjuste(BaseModel):
    valor: object


@router.put("/{key}")
async def cambiar_ajuste(key: str, body: CambioAjuste, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _solo_super_admin(user)
    ajuste = POR_KEY.get(key)
    if not ajuste:
        raise HTTPException(status_code=404, detail="Ajuste no encontrado")
    nuevo = _normalizar(ajuste, body.valor)
    anterior = (await _valores(db)).get(key, ajuste["default"])
    if nuevo == anterior:
        return {"key": key, "valor": nuevo, "cambio": False}
    ahora = datetime.now(timezone.utc)
    await db.execute(text(
        "INSERT INTO incidencias_settings (id, key, value, updated_at) VALUES (:id, :key, :value, :now) "
        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at"),
        {"id": str(uuid.uuid4()), "key": key, "value": nuevo, "now": ahora})
    await db.execute(text(
        "INSERT INTO ajustes_historial (id, key, valor_anterior, valor_nuevo, usuario_id, usuario_nombre, created_at) "
        "VALUES (:id, :key, :ant, :nue, :uid, :unom, :now)"),
        {"id": str(uuid.uuid4()), "key": key, "ant": anterior, "nue": nuevo, "uid": user.get("user_id"),
         "unom": user.get("full_name") or "", "now": ahora})
    await db.commit()
    return {"key": key, "valor": nuevo, "cambio": True}
