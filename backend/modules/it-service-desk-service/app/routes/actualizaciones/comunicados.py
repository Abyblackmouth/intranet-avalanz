"""Comunicados operativos del IT Service Desk.

- Administracion (Incident Manager y super admin): /actualizaciones/comunicados
- Consulta de los vigentes (cualquier usuario del modulo): /comunicados/activos

Las fechas llegan como hora local de Monterrey (datetime-local del navegador)
y se guardan en UTC. Cada edicion de contenido o de horario sube la version,
para que el modal vuelva a mostrarse a quien ya lo habia cerrado.
"""
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mesa_de_soporte import Comunicado
from app.routes.actualizaciones.actualizaciones import get_current_user, _require_incident_manager

try:
    from app.database import get_db
except ImportError:  # pragma: no cover
    from app.routes.mesa_de_soporte.mesa_de_soporte import get_db

MTY = ZoneInfo("America/Monterrey")
admin_router = APIRouter(prefix="/actualizaciones/comunicados", tags=["Comunicados"])
publico_router = APIRouter(prefix="/comunicados", tags=["Comunicados"])


def _a_utc(valor: str) -> datetime:
    d = datetime.fromisoformat(valor)
    if d.tzinfo is None:
        d = d.replace(tzinfo=MTY)
    return d.astimezone(timezone.utc)


def _json(c: Comunicado) -> dict:
    return {"id": str(c.id), "titulo": c.titulo, "mensaje": c.mensaje, "inicio": c.inicio.isoformat(),
            "fin": c.fin.isoformat(), "activo": c.activo, "version": c.version,
            "creado_por_nombre": c.creado_por_nombre}


class ComunicadoNuevo(BaseModel):
    titulo: str
    mensaje: str
    inicio: str
    fin: str


class ComunicadoCambio(BaseModel):
    titulo: Optional[str] = None
    mensaje: Optional[str] = None
    inicio: Optional[str] = None
    fin: Optional[str] = None
    activo: Optional[bool] = None


@admin_router.get("")
async def listar(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    filas = (await db.execute(select(Comunicado).order_by(Comunicado.inicio.desc()))).scalars().all()
    return {"data": [_json(c) for c in filas]}


@admin_router.post("")
async def crear(body: ComunicadoNuevo, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    titulo, mensaje = body.titulo.strip(), body.mensaje.strip()
    if not titulo or not mensaje:
        raise HTTPException(status_code=422, detail="Escribe el título y el mensaje")
    inicio, fin = _a_utc(body.inicio), _a_utc(body.fin)
    if fin <= inicio:
        raise HTTPException(status_code=422, detail="El fin debe ser después del inicio")
    c = Comunicado(titulo=titulo[:150], mensaje=mensaje, inicio=inicio, fin=fin, activo=True, version=1,
                   creado_por=user.get("user_id"), creado_por_nombre=user.get("full_name"))
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"data": _json(c)}


@admin_router.patch("/{comunicado_id}")
async def editar(comunicado_id: str, body: ComunicadoCambio, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    c = (await db.execute(select(Comunicado).where(Comunicado.id == comunicado_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Comunicado no encontrado")
    cambio_contenido = False
    if body.titulo is not None and body.titulo.strip() != c.titulo:
        c.titulo, cambio_contenido = body.titulo.strip()[:150], True
    if body.mensaje is not None and body.mensaje.strip() != c.mensaje:
        c.mensaje, cambio_contenido = body.mensaje.strip(), True
    if body.inicio is not None:
        nuevo = _a_utc(body.inicio)
        if nuevo != c.inicio:
            c.inicio, cambio_contenido = nuevo, True
    if body.fin is not None:
        nuevo = _a_utc(body.fin)
        if nuevo != c.fin:
            c.fin, cambio_contenido = nuevo, True
    if c.fin <= c.inicio:
        raise HTTPException(status_code=422, detail="El fin debe ser después del inicio")
    if body.activo is not None:
        c.activo = body.activo
    if cambio_contenido:
        c.version = (c.version or 1) + 1   # vuelve a aparecer a quien ya lo habia cerrado
    c.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(c)
    return {"data": _json(c)}


@admin_router.delete("/{comunicado_id}")
async def borrar(comunicado_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    c = (await db.execute(select(Comunicado).where(Comunicado.id == comunicado_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Comunicado no encontrado")
    await db.delete(c)
    await db.commit()
    return {"success": True}


@publico_router.get("/activos")
async def activos(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Comunicados vigentes en este momento, para el modal del modulo."""
    ahora = datetime.now(timezone.utc)
    filas = (await db.execute(select(Comunicado).where(
        Comunicado.activo.is_(True), Comunicado.inicio <= ahora, Comunicado.fin >= ahora
    ).order_by(Comunicado.inicio))).scalars().all()
    return {"data": [_json(c) for c in filas]}
