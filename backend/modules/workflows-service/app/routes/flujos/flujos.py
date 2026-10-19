"""Submódulo Flujos: definición de flujos, grupos de aprobación, etapas, versiones y simulador.

Quién puede qué: super admin y workflows:administrador editan; workflows:disenador edita
la definición; workflows:auditoria solo lee. Los aprobadores no entran aquí.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_roles
from app.database import get_db
from app.services.ajustes import usuarios_service
from app.services.flujos import flujos_service

router = APIRouter(prefix="/flujos", tags=["Flujos"])

lectura = require_roles("administrador", "disenador", "auditoria")
edicion = require_roles("administrador", "disenador")


class FlujoIn(BaseModel):
    conexion_id: str
    process_id: str
    nombre: str
    descripcion: Optional[str] = None
    result_service: str = ""
    activo: bool = True


class FlujoPatch(BaseModel):
    process_id: Optional[str] = None
    resumen: Optional[Dict[str, Any]] = None
    hoja: Optional[Dict[str, Any]] = None


class HojaIn(BaseModel):
    hoja: Optional[Dict[str, Any]] = None
    aliases: Optional[List[str]] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    result_service: Optional[str] = None
    activo: Optional[bool] = None


class GrupoIn(BaseModel):
    origen_clave: str
    nombre: str
    es_default: bool = False
    auto_aprobacion: str = "omitir"
    activo: bool = True


class GrupoPatch(BaseModel):
    origen_clave: Optional[str] = None
    nombre: Optional[str] = None
    es_default: Optional[bool] = None
    auto_aprobacion: Optional[str] = None
    activo: Optional[bool] = None


class MiembroIn(BaseModel):
    user_id: str
    nombre: str = ""
    login_externo: Optional[str] = None


class EtapaIn(BaseModel):
    nombre: str
    tipo: str = "aprobacion"
    puesto_esperado: Optional[str] = None
    aprobador_user_id: Optional[str] = None
    aprobador_nombre: Optional[str] = ""
    aprobador_email: Optional[str] = None
    suplente_user_id: Optional[str] = None
    suplente_nombre: Optional[str] = None
    suplente_email: Optional[str] = None
    condicion: Optional[str] = None
    comentario_rechazo_obligatorio: bool = True
    permite_adjuntos: bool = True


class EtapaPatch(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    puesto_esperado: Optional[str] = None
    aprobador_user_id: Optional[str] = None
    aprobador_nombre: Optional[str] = None
    aprobador_email: Optional[str] = None
    suplente_user_id: Optional[str] = None
    suplente_nombre: Optional[str] = None
    suplente_email: Optional[str] = None
    condicion: Optional[str] = None
    comentario_rechazo_obligatorio: Optional[bool] = None
    permite_adjuntos: Optional[bool] = None
    quitar_suplente: Optional[bool] = None
    mover: Optional[str] = None   # subir | bajar


class SimularIn(BaseModel):
    origen_clave: str
    requester_user_id: Optional[str] = None
    card_data: Dict[str, Any] = {}


@router.get("")
async def listar(db: AsyncSession = Depends(get_db), user: dict = Depends(lectura)):
    return await flujos_service.listar(db)


@router.post("", status_code=201)
async def crear(body: FlujoIn, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.crear(db, body.model_dump(), user)


# Dos segmentos a propósito: no chocan con GET /{flujo_id}
@router.get("/catalogos/conexiones")
async def catalogo_conexiones(db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    """Conexiones sin secretos, para elegir la plataforma al crear un flujo."""
    from sqlalchemy import select
    from app.models import Conexion, ConexionEmpresa
    conexiones = (await db.execute(select(Conexion).order_by(Conexion.titulo))).scalars().all()
    empresas = (await db.execute(select(ConexionEmpresa).where(ConexionEmpresa.activa == True))).scalars().all()  # noqa: E712
    return [{"id": c.id, "slug": c.slug, "titulo": c.titulo, "activa": c.activa,
             "empresas": [{"clave": e.clave, "nombre": e.nombre} for e in sorted(empresas, key=lambda x: x.clave) if e.conexion_id == c.id]} for c in conexiones]


@router.get("/catalogos/usuarios")
async def buscar_usuarios(q: str = "", user: dict = Depends(edicion)):
    return await usuarios_service.buscar_intranet(q)


@router.get("/{flujo_id}")
async def detalle(flujo_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(lectura)):
    return await flujos_service.detalle(db, flujo_id)


@router.patch("/{flujo_id}")
async def actualizar(flujo_id: str, body: FlujoPatch, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.actualizar(db, flujo_id, body.model_dump(exclude_unset=True), user)


@router.delete("/{flujo_id}", status_code=204)
async def eliminar(flujo_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    await flujos_service.eliminar(db, flujo_id, user)


@router.get("/{flujo_id}/versiones")
async def versiones(flujo_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(lectura)):
    return await flujos_service.versiones(db, flujo_id)


@router.get("/{flujo_id}/definicion")
async def definicion(flujo_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(lectura)):
    return await flujos_service.definicion(db, flujo_id)


# ── Hoja del trámite (plantilla) ──────────────────────────────────────────

async def _ultima_instancia(db: AsyncSession, flujo_id: str):
    from sqlalchemy import select
    from app.models import Instancia
    return (await db.execute(select(Instancia).where(Instancia.flujo_id == flujo_id).order_by(Instancia.created_at.desc()).limit(1))).scalar_one_or_none()


@router.get("/{flujo_id}/hoja/sugerida")
async def hoja_sugerida(flujo_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    """«Detectar campos»: hoja inferida del cardData del último trámite real del flujo."""
    from app.motor.hoja import inferir
    f = await flujos_service.obtener(db, flujo_id)
    inst = await _ultima_instancia(db, flujo_id)
    if not inst:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Este flujo todavía no tiene trámites; manda uno desde la plataforma para detectar sus campos")
    return {"hoja": inferir(inst.card_data or {}, f.resumen), "folio": inst.folio, "claves": sorted((inst.card_data or {}).keys())}


@router.post("/{flujo_id}/hoja/vista-previa")
async def hoja_vista_previa(flujo_id: str, body: HojaIn, db: AsyncSession = Depends(get_db), user: dict = Depends(lectura)):
    """Arma la hoja con la configuración del editor (sin guardar) sobre el último trámite real."""
    from fastapi import HTTPException
    from app.motor.hoja import normalizar
    from app.motor.hoja_db import hoja_de
    from app.motor.hoja_correo import html
    await flujos_service.obtener(db, flujo_id)
    inst = await _ultima_instancia(db, flujo_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Este flujo todavía no tiene trámites para previsualizar")
    try:
        cfg = normalizar(body.hoja) if body.hoja is not None else None
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    h = await hoja_de(db, inst, con_urls=False, cfg_override=cfg)
    from app.motor.hoja_pagina import html as pagina_html
    from app.motor.avisos import resumen_breve
    return {"hoja": h, "pagina_html": pagina_html(h, puede_decidir=True, url_decidir="#", decide_como="(vista previa)", etapa_orden=1, etapa_nombre="Etapa de ejemplo"),
            "correo_html": resumen_breve(h), "folio": inst.folio}


@router.post("/{flujo_id}/hoja/prueba")
async def hoja_prueba(flujo_id: str, body: HojaIn, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    """Manda a quien edita un correo de prueba con la hoja (configuración del editor, sin guardar)."""
    import httpx
    from fastapi import HTTPException
    from app.config import config
    from app.motor.hoja import normalizar
    from app.motor.hoja_db import hoja_de
    from app.motor.hoja_correo import html
    f = await flujos_service.obtener(db, flujo_id)
    inst = await _ultima_instancia(db, flujo_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Este flujo todavía no tiene trámites para la prueba")
    if not user.get("email"):
        raise HTTPException(status_code=422, detail="Tu usuario no tiene correo registrado")
    try:
        cfg = normalizar(body.hoja) if body.hoja is not None else None
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    h = await hoja_de(db, inst, con_urls=False, cfg_override=cfg)
    from app.motor.avisos import resumen_breve
    cuerpo = (f"<p style='font-size:12px;color:#64748b'>Correo de prueba de «{f.nombre}» con los datos del trámite {inst.folio}. Así lo recibe el aprobador; en el correo real el botón abre la página de aprobación.</p>"
              "<h2 style='margin:0 0 6px'>Tienes una aprobación pendiente</h2>" + resumen_breve(h)
              + __import__("app.motor.avisos", fromlist=["_boton"])._boton(f"{config.FRONTEND_URL.rstrip('/')}/app/workflows/flujos", "Revisar y decidir"))
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(f"{config.EMAIL_SERVICE_URL}/api/v1/email/module", json={"to_email": user["email"], "full_name": user.get("full_name") or "", "subject": f"[Prueba] Hoja · {f.nombre} · {inst.folio}", "html_content": cuerpo})
    if r.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"email-service contestó HTTP {r.status_code}")
    return {"ok": True, "para": user["email"]}


@router.post("/{flujo_id}/simular")
async def simular(flujo_id: str, body: SimularIn, db: AsyncSession = Depends(get_db), user: dict = Depends(lectura)):
    return await flujos_service.simular(db, flujo_id, body.origen_clave, body.requester_user_id, body.card_data)


# ── Grupos ────────────────────────────────────────────────────────────────

@router.post("/{flujo_id}/grupos", status_code=201)
async def crear_grupo(flujo_id: str, body: GrupoIn, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.crear_grupo(db, flujo_id, body.model_dump(), user)


@router.patch("/{flujo_id}/grupos/{grupo_id}")
async def actualizar_grupo(flujo_id: str, grupo_id: str, body: GrupoPatch, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.actualizar_grupo(db, flujo_id, grupo_id, body.model_dump(exclude_unset=True), user)


@router.delete("/{flujo_id}/grupos/{grupo_id}")
async def eliminar_grupo(flujo_id: str, grupo_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.eliminar_grupo(db, flujo_id, grupo_id, user)


@router.post("/{flujo_id}/grupos/{grupo_id}/miembros", status_code=201)
async def agregar_miembro(flujo_id: str, grupo_id: str, body: MiembroIn, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.agregar_miembro(db, flujo_id, grupo_id, body.model_dump(), user)


@router.delete("/{flujo_id}/grupos/{grupo_id}/miembros/{miembro_id}")
async def quitar_miembro(flujo_id: str, grupo_id: str, miembro_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.quitar_miembro(db, flujo_id, grupo_id, miembro_id, user)


# ── Etapas ────────────────────────────────────────────────────────────────

@router.post("/{flujo_id}/grupos/{grupo_id}/etapas", status_code=201)
async def crear_etapa(flujo_id: str, grupo_id: str, body: EtapaIn, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.crear_etapa(db, flujo_id, grupo_id, body.model_dump(), user)


@router.patch("/{flujo_id}/grupos/{grupo_id}/etapas/{etapa_id}")
async def actualizar_etapa(flujo_id: str, grupo_id: str, etapa_id: str, body: EtapaPatch, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    datos = body.model_dump(exclude_unset=True)
    if datos.pop("quitar_suplente", False):
        datos.update({"suplente_user_id": None, "suplente_nombre": None, "suplente_email": None})
    return await flujos_service.actualizar_etapa(db, flujo_id, grupo_id, etapa_id, datos, user)


@router.delete("/{flujo_id}/grupos/{grupo_id}/etapas/{etapa_id}")
async def eliminar_etapa(flujo_id: str, grupo_id: str, etapa_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(edicion)):
    return await flujos_service.eliminar_etapa(db, flujo_id, grupo_id, etapa_id, user)
