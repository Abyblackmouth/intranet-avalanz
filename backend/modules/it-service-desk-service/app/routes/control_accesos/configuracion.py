"""Configuracion de los formatos de solicitud de acceso (pestana de Actualizaciones).

Empresas: solo se guarda el id y el orden; nombre corto, razon social, familia y si
opera se leen del catalogo de la intranet (admin-service /internal/companies)."""
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.mesa_de_soporte import (
    AccFormato, AccFormatoEmpresa, AccFormatoModulo, AccModuloPerfil, AccModuloRutina, TicketSeverity, TicketSystem,
)
from app.routes.mesa_de_soporte.mesa_de_soporte import get_current_user

router = APIRouter(prefix="/control-accesos/config")
ROLES_CONFIG = {"it-service-desk:incident-manager", "super_admin"}
PERFILES_POR_DEFECTO = ["Visor", "Completo"]


def _puede_configurar(user: dict) -> None:
    if not set(user.get("roles") or []) & ROLES_CONFIG and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Solo el Incident Manager o el super admin configuran los formatos")


async def _catalogo_empresas() -> list:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get("http://admin-service:8000/internal/companies")
        return r.json() if r.status_code == 200 else []
    except Exception:
        return []


async def _formato(db: AsyncSession, formato_id: str) -> AccFormato:
    f = (await db.execute(select(AccFormato).where(AccFormato.id == formato_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Formato no encontrado")
    return f


async def _modulo(db: AsyncSession, modulo_id: str) -> AccFormatoModulo:
    m = (await db.execute(select(AccFormatoModulo).where(AccFormatoModulo.id == modulo_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    return m


def _texto(valor: Optional[str], campo: str, mayusculas: bool = False) -> str:
    t = (valor or "").strip()
    if not t:
        raise HTTPException(status_code=422, detail=f"{campo} es obligatorio")
    return t.upper() if mayusculas else t


# ── Formatos ──────────────────────────────────────────────────────────────

@router.get("/formatos")
async def listar_formatos(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    filas = (await db.execute(
        select(AccFormato, TicketSystem.name).join(TicketSystem, TicketSystem.id == AccFormato.system_id).order_by(AccFormato.orden, AccFormato.nombre)
    )).all()
    mods = dict((await db.execute(select(AccFormatoModulo.formato_id, func.count()).where(AccFormatoModulo.activo == True).group_by(AccFormatoModulo.formato_id))).all())
    emps = dict((await db.execute(select(AccFormatoEmpresa.formato_id, func.count()).group_by(AccFormatoEmpresa.formato_id))).all())
    return [{"id": f.id, "clave": f.clave, "nombre": f.nombre, "sistema": sistema, "activo": f.activo,
             "modulos": mods.get(f.id, 0), "empresas": emps.get(f.id, 0)} for f, sistema in filas]


@router.get("/formatos/{formato_id}")
async def detalle_formato(formato_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    f = await _formato(db, formato_id)
    sistema = (await db.execute(select(TicketSystem.name).where(TicketSystem.id == f.system_id))).scalar_one_or_none()
    severidades = (await db.execute(select(TicketSeverity).order_by(TicketSeverity.code))).scalars().all()
    elegidas = (await db.execute(select(AccFormatoEmpresa).where(AccFormatoEmpresa.formato_id == f.id).order_by(AccFormatoEmpresa.orden))).scalars().all()
    modulos = (await db.execute(select(AccFormatoModulo).where(AccFormatoModulo.formato_id == f.id).order_by(AccFormatoModulo.orden))).scalars().all()
    ids = [m.id for m in modulos]
    perfiles, rutinas = {}, {}
    if ids:
        for p in (await db.execute(select(AccModuloPerfil).where(AccModuloPerfil.modulo_id.in_(ids)).order_by(AccModuloPerfil.orden))).scalars().all():
            perfiles.setdefault(p.modulo_id, []).append({"id": p.id, "nombre": p.nombre})
        for r in (await db.execute(select(AccModuloRutina).where(AccModuloRutina.modulo_id.in_(ids)).order_by(AccModuloRutina.orden, AccModuloRutina.nombre))).scalars().all():
            rutinas.setdefault(r.modulo_id, []).append({"id": r.id, "nombre": r.nombre, "activo": r.activo})
    catalogo = await _catalogo_empresas()
    elegidas_ids = [e.company_id for e in elegidas]
    return {
        "formato": {"id": f.id, "clave": f.clave, "nombre": f.nombre, "sistema": sistema, "activo": f.activo,
                    "severity_id": f.severity_id, "admin_user_id": f.admin_user_id, "admin_nombre": f.admin_nombre,
                    "presentacion": f.presentacion or {}},
        "severidades": [{"id": s.id, "code": s.code, "name": s.name} for s in severidades],
        "empresas_elegidas": elegidas_ids,
        # Se ofrecen las que operan, mas las ya elegidas aunque hayan dejado de operar (para poder quitarlas)
        "catalogo_empresas": [c for c in catalogo if c.get("operando") or c["id"] in elegidas_ids],
        "modulos": [{"id": m.id, "nombre": m.nombre, "exclusivo_admin": m.exclusivo_admin, "orden": m.orden, "activo": m.activo,
                     "perfiles": perfiles.get(m.id, []), "rutinas": rutinas.get(m.id, [])} for m in modulos],
    }


class FormatoPayload(BaseModel):
    nombre: Optional[str] = None
    severity_id: Optional[str] = None
    admin_user_id: Optional[str] = None
    admin_nombre: Optional[str] = None
    activo: Optional[bool] = None
    presentacion: Optional[dict] = None


@router.patch("/formatos/{formato_id}")
async def actualizar_formato(formato_id: str, body: FormatoPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    f = await _formato(db, formato_id)
    if body.nombre is not None:
        f.nombre = _texto(body.nombre, "El nombre del formato")
    if body.severity_id is not None:
        if not (await db.execute(select(TicketSeverity).where(TicketSeverity.id == body.severity_id))).scalar_one_or_none():
            raise HTTPException(status_code=422, detail="Severidad no válida")
        f.severity_id = body.severity_id
    if body.admin_user_id is not None:
        f.admin_user_id = body.admin_user_id or None
        f.admin_nombre = (body.admin_nombre or "").strip() or None
    if body.activo is not None:
        f.activo = body.activo
    if body.presentacion is not None:
        orden = list(dict.fromkeys(str(x) for x in (body.presentacion.get("orden") or [])))
        juntas = list(dict.fromkeys(str(x) for x in (body.presentacion.get("juntas") or []) if str(x) in orden))
        f.presentacion = {"orden": orden, "juntas": juntas}
    f.updated_at = func.now()
    await db.commit()
    return {"success": True}


class EmpresasPayload(BaseModel):
    company_ids: list[str]


@router.put("/formatos/{formato_id}/empresas")
async def guardar_empresas(formato_id: str, body: EmpresasPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Reemplaza la lista completa, en el orden recibido."""
    _puede_configurar(user)
    f = await _formato(db, formato_id)
    validas = {c["id"] for c in await _catalogo_empresas()}
    desconocidas = [c for c in body.company_ids if c not in validas]
    if validas and desconocidas:
        raise HTTPException(status_code=422, detail="Hay empresas que no existen en el catálogo de la intranet")
    await db.execute(delete(AccFormatoEmpresa).where(AccFormatoEmpresa.formato_id == f.id))
    for i, cid in enumerate(dict.fromkeys(body.company_ids), 1):
        db.add(AccFormatoEmpresa(formato_id=f.id, company_id=cid, orden=i))
    await db.commit()
    return {"success": True, "empresas": len(set(body.company_ids))}


# ── Módulos ───────────────────────────────────────────────────────────────

class ModuloPayload(BaseModel):
    nombre: Optional[str] = None
    exclusivo_admin: Optional[bool] = None
    activo: Optional[bool] = None


@router.post("/formatos/{formato_id}/modulos")
async def crear_modulo(formato_id: str, body: ModuloPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    f = await _formato(db, formato_id)
    nombre = _texto(body.nombre, "El nombre del módulo", mayusculas=True)
    ultimo = (await db.execute(select(func.max(AccFormatoModulo.orden)).where(AccFormatoModulo.formato_id == f.id))).scalar() or 0
    m = AccFormatoModulo(formato_id=f.id, nombre=nombre, exclusivo_admin=bool(body.exclusivo_admin), orden=ultimo + 1, activo=True)
    db.add(m)
    await db.flush()
    for i, p in enumerate(PERFILES_POR_DEFECTO, 1):
        db.add(AccModuloPerfil(modulo_id=m.id, nombre=p, orden=i))
    await db.commit()
    return {"success": True, "id": m.id}


@router.patch("/modulos/{modulo_id}")
async def actualizar_modulo(modulo_id: str, body: ModuloPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    m = await _modulo(db, modulo_id)
    if body.nombre is not None:
        m.nombre = _texto(body.nombre, "El nombre del módulo", mayusculas=True)
    if body.exclusivo_admin is not None:
        m.exclusivo_admin = body.exclusivo_admin
    if body.activo is not None:
        m.activo = body.activo
    await db.commit()
    return {"success": True}


class OrdenPayload(BaseModel):
    ids: list[str]


@router.put("/formatos/{formato_id}/modulos/orden")
async def ordenar_modulos(formato_id: str, body: OrdenPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    f = await _formato(db, formato_id)
    modulos = {m.id: m for m in (await db.execute(select(AccFormatoModulo).where(AccFormatoModulo.formato_id == f.id))).scalars().all()}
    for i, mid in enumerate(body.ids, 1):
        if mid in modulos:
            modulos[mid].orden = i
    await db.commit()
    return {"success": True}


# ── Perfiles y rutinas ────────────────────────────────────────────────────

class NombrePayload(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


@router.post("/modulos/{modulo_id}/perfiles")
async def crear_perfil(modulo_id: str, body: NombrePayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    m = await _modulo(db, modulo_id)
    ultimo = (await db.execute(select(func.max(AccModuloPerfil.orden)).where(AccModuloPerfil.modulo_id == m.id))).scalar() or 0
    p = AccModuloPerfil(modulo_id=m.id, nombre=_texto(body.nombre, "El nombre del perfil"), orden=ultimo + 1)
    db.add(p)
    await db.commit()
    return {"success": True, "id": p.id}


@router.patch("/perfiles/{perfil_id}")
async def renombrar_perfil(perfil_id: str, body: NombrePayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    p = (await db.execute(select(AccModuloPerfil).where(AccModuloPerfil.id == perfil_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    p.nombre = _texto(body.nombre, "El nombre del perfil")
    await db.commit()
    return {"success": True}


@router.delete("/perfiles/{perfil_id}")
async def quitar_perfil(perfil_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    p = (await db.execute(select(AccModuloPerfil).where(AccModuloPerfil.id == perfil_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    restantes = (await db.execute(select(func.count()).where(AccModuloPerfil.modulo_id == p.modulo_id))).scalar()
    if restantes <= 1:
        raise HTTPException(status_code=409, detail="Un módulo necesita al menos un perfil")
    await db.delete(p)
    await db.commit()
    return {"success": True}


@router.post("/modulos/{modulo_id}/rutinas")
async def crear_rutina(modulo_id: str, body: NombrePayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    m = await _modulo(db, modulo_id)
    nombre = _texto(body.nombre, "El nombre de la rutina")
    if "|" in nombre:
        raise HTTPException(status_code=422, detail="El nombre de la rutina no puede llevar el carácter |")
    ultimo = (await db.execute(select(func.max(AccModuloRutina.orden)).where(AccModuloRutina.modulo_id == m.id))).scalar() or 0
    r = AccModuloRutina(modulo_id=m.id, nombre=nombre, orden=ultimo + 1, activo=True)
    db.add(r)
    await db.commit()
    return {"success": True, "id": r.id}


@router.patch("/rutinas/{rutina_id}")
async def actualizar_rutina(rutina_id: str, body: NombrePayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _puede_configurar(user)
    r = (await db.execute(select(AccModuloRutina).where(AccModuloRutina.id == rutina_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")
    if body.nombre is not None:
        r.nombre = _texto(body.nombre, "El nombre de la rutina")
    if body.activo is not None:
        r.activo = body.activo
    await db.commit()
    return {"success": True}


@router.delete("/rutinas/{rutina_id}")
async def quitar_rutina(rutina_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Las solicitudes guardan su propia copia, asi que quitar una rutina no las afecta."""
    _puede_configurar(user)
    r = (await db.execute(select(AccModuloRutina).where(AccModuloRutina.id == rutina_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")
    await db.delete(r)
    await db.commit()
    return {"success": True}


# ── Vista previa del formato (el mismo template que el PDF) ─────────────────
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Query
from fastapi.responses import HTMLResponse
from sqlalchemy import text

from app.services.control_accesos.motor.documento import contexto_vista_previa, renderizar


@router.get("/formatos/{formato_id}/vista-previa", response_class=HTMLResponse)
async def vista_previa(formato_id: str, empresas: Optional[str] = Query(None, description="ids separados por coma; si viene, reemplaza las guardadas"),
                       db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    config = await detalle_formato(formato_id=formato_id, db=db, user=user)
    if empresas is not None:
        config["empresas_elegidas"] = [e for e in empresas.split(",") if e]
    ajustes = dict((await db.execute(text("SELECT key, value FROM incidencias_settings WHERE key LIKE 'acc.%'"))).all())
    metodo = ajustes.get("acc.metodo_firma", "manual")
    prueba = metodo == "docusign" and ajustes.get("acc.docusign_ambiente", "pruebas") == "pruebas"
    fecha = datetime.now(ZoneInfo("America/Monterrey")).strftime("%d/%m/%Y")
    return HTMLResponse(renderizar(config["formato"]["clave"], contexto_vista_previa(config, fecha, metodo, prueba)))
