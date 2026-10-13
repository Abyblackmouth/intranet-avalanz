"""Plugins de Toolkit TI: lista estilo Swagger, activar/desactivar, ejecutar e historial."""
import asyncio
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import exigir_operar, exigir_ver, get_current_user, puede_operar
from app.database import get_db
from app.models import PluginEjecucion, PluginEstado
from app.plugins import descubrir
from app.services.plugins import plugins_service as svc

router = APIRouter(prefix="/plugins", tags=["Plugins"])
MAX_ARCHIVO = 50 * 1024 * 1024


def _ejec(e: PluginEjecucion) -> dict:
    return {"id": str(e.id), "slug": e.slug, "estado": e.estado, "parametros": e.parametros, "origen": e.origen,
            "archivos_entrada": e.archivos_entrada, "archivos_salida": e.archivos_salida, "log": e.log, "error": e.error,
            "iniciado_por": e.iniciado_por, "iniciado_at": e.iniciado_at.isoformat() if e.iniciado_at else None,
            "terminado_at": e.terminado_at.isoformat() if e.terminado_at else None, "duracion_ms": e.duracion_ms}


@router.get("")
async def listar(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    exigir_ver(user)
    fichas = descubrir()
    estados = {e.slug: e.activo for e in (await db.execute(select(PluginEstado))).scalars().all()}
    ultimas = {}
    for e in (await db.execute(select(PluginEjecucion).order_by(PluginEjecucion.iniciado_at.desc()).limit(500))).scalars().all():
        ultimas.setdefault(e.slug, e)
    datos = []
    for slug, f in sorted(fichas.items(), key=lambda x: (x[1]["grupo"], x[1]["nombre"])):
        u = ultimas.get(slug)
        datos.append({**f, "activo": estados.get(slug, True),
                      "ultima": {"estado": u.estado, "iniciado_at": u.iniciado_at.isoformat()} if u else None})
    return {"data": {"plugins": datos, "puede_operar": puede_operar(user), "con_error": descubrir.errores}}


class Cambio(BaseModel):
    activo: bool


@router.patch("/{slug}")
async def activar(slug: str, body: Cambio, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    exigir_operar(user)
    if slug not in descubrir():
        raise HTTPException(status_code=404, detail="Plugin no encontrado")
    e = (await db.execute(select(PluginEstado).where(PluginEstado.slug == slug))).scalar_one_or_none()
    if not e:
        e = PluginEstado(slug=slug)
        db.add(e)
    e.activo, e.actualizado_por = body.activo, user.get("full_name")
    await db.commit()
    return {"data": {"slug": slug, "activo": body.activo}}


@router.post("/{slug}/ejecutar")
async def ejecutar(slug: str, params: str = Form("{}"), files: List[UploadFile] = File(default=[]),
                   db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    exigir_operar(user)
    ficha = descubrir().get(slug)
    if not ficha:
        raise HTTPException(status_code=404, detail="Plugin no encontrado")
    e = (await db.execute(select(PluginEstado).where(PluginEstado.slug == slug))).scalar_one_or_none()
    if e and not e.activo:
        raise HTTPException(status_code=409, detail="El plugin está desactivado")
    try:
        valores = json.loads(params or "{}")
    except ValueError:
        raise HTTPException(status_code=422, detail="Parámetros con formato inválido")
    # Los archivos llegan con el nombre del parametro como nombre de campo: "archivo::nomina.xlsx"
    por_param = {}
    for f in files or []:
        if not f or not f.filename or "::" not in f.filename:
            continue
        param, nombre = f.filename.split("::", 1)
        datos = await f.read()
        if len(datos) > MAX_ARCHIVO:
            raise HTTPException(status_code=422, detail=f"{nombre} pesa más de 50 MB")
        por_param[param] = (nombre, datos)
    for p in ficha["parametros"]:
        n = p["nombre"]
        if p["tipo"] == "archivo":
            if p.get("requerido") and n not in por_param:
                raise HTTPException(status_code=422, detail=f"Falta el archivo «{n}»")
            ext = p.get("extensiones")
            if n in por_param and ext and not any(por_param[n][0].lower().endswith(x.lower()) for x in ext):
                raise HTTPException(status_code=422, detail=f"«{n}» debe ser {' o '.join(ext)}")
        elif p.get("requerido") and valores.get(n) in (None, ""):
            raise HTTPException(status_code=422, detail=f"Falta el parámetro «{n}»")
    ejecucion_id, trabajo = await svc.preparar(slug, valores, por_param, user)
    asyncio.create_task(svc.correr(ejecucion_id, slug, trabajo, int(ficha["tiempo_maximo"])))
    return {"data": {"id": str(ejecucion_id), "estado": "en_proceso"}}


@router.get("/{slug}/ejecuciones")
async def historial(slug: str, limite: int = 10, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    exigir_ver(user)
    filas = (await db.execute(select(PluginEjecucion).where(PluginEjecucion.slug == slug)
                              .order_by(PluginEjecucion.iniciado_at.desc()).limit(min(limite, 50)))).scalars().all()
    return {"data": [_ejec(e) for e in filas]}


@router.get("/ejecuciones/{ejecucion_id}")
async def una_ejecucion(ejecucion_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    exigir_ver(user)
    e = (await db.execute(select(PluginEjecucion).where(PluginEjecucion.id == ejecucion_id))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada")
    return {"data": _ejec(e)}
