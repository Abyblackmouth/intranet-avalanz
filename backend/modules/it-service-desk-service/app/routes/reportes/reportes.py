"""Reportes para presentacion: datos del periodo, vista previa (HTML) y PDF 16:9.

La presentacion se arma en el servidor con los datos y las elecciones del usuario (periodo,
empresa, tema, laminas y textos). Ese mismo HTML es la vista previa y el PDF, que convierte
Gotenberg (Chromium sin JavaScript, sin acceso a internet). La pantalla nunca manda HTML.
"""
import re
from datetime import date
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.database import get_db
from app.models.mesa_de_soporte import Incident
from app.services.reportes import reportes_service as R
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/reportes", tags=["Reportes"])
_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()
GOTENBERG = "http://avalanz-gotenberg:3000/forms/chromium/convert/html"


REPORTES_ROLES = {"super_admin", "admin_empresa", "it-service-desk:incident-manager", "it-service-desk:project-manager"}


def _permiso(user: dict) -> None:
    """Solo super admin, Admin Empresa, Incident Manager y Project Manager."""
    if not set(user.get("roles") or []) & REPORTES_ROLES:
        raise HTTPException(status_code=403, detail="No tienes acceso a los reportes")


class Opciones(BaseModel):
    desde: date
    hasta: date
    empresa: Optional[str] = Field(None, max_length=150)
    tema: str = Field("avalanz", max_length=20)
    acento: Optional[str] = Field(None, max_length=7)
    laminas: List[str] = Field(default_factory=lambda: ["resumen", "compacto"], max_length=6)
    titulo: Optional[str] = Field(None, max_length=80)
    estatus: Optional[str] = Field(None, max_length=200)
    hallazgos: List[str] = Field(default_factory=list, max_length=8)
    acciones: List[str] = Field(default_factory=list, max_length=8)
    grafica: str = Field("flujo", max_length=12)      # flujo (entradas, salidas y saldo) | abiertos (la anterior)


async def _severidades(db) -> dict:
    filas = (await db.execute(text("select * from ticket_severities"))).mappings().all()
    salida = {}
    for f in filas:
        partes = [str(f.get(k) or "") for k in ("code", "clave", "codigo", "level", "name", "nombre") if f.get(k)]
        salida[str(f["id"])] = " ".join(partes)
    return salida


async def _datos(db, desde: date, hasta: date, empresa: Optional[str]):
    if hasta < desde:
        raise HTTPException(status_code=422, detail="La fecha final es anterior a la inicial")
    if (hasta - desde).days > 400:
        raise HTTPException(status_code=422, detail="El periodo no puede pasar de 400 días")
    ini, fin = R.rango(desde, hasta)
    q = select(Incident).where(Incident.created_at >= ini, Incident.created_at < fin,
                               Incident.ticket_type.in_(("incidente", "solicitud_acceso")))
    if empresa:
        q = q.where(Incident.requester_company_name == empresa)
    tickets = (await db.execute(q)).scalars().all()
    # Para "abiertos al cierre de cada dia": tambien los creados antes del periodo que seguian abiertos
    qh = select(Incident).where(Incident.created_at < fin, Incident.ticket_type.in_(("incidente", "solicitud_acceso")),
                                or_(~Incident.status.in_(tuple(R.FINALES)),
                                    func.coalesce(Incident.resolved_at, Incident.closed_at, Incident.updated_at) >= ini))
    # Todos los tipos del periodo (incluidos los Controles de Cambio), solo para la lamina "Tickets por tipo"
    qt = select(Incident).where(Incident.created_at >= ini, Incident.created_at < fin)
    if empresa:
        qh = qh.where(Incident.requester_company_name == empresa)
        qt = qt.where(Incident.requester_company_name == empresa)
    historico = (await db.execute(qh)).scalars().all()
    todos = (await db.execute(qt)).scalars().all()
    sistemas = {str(a): b for a, b in (await db.execute(text("select id, name from ticket_systems"))).all()}
    modulos = {str(a): b for a, b in (await db.execute(text("select id, name from ticket_modules"))).all()}
    d = R.calcular(tickets, sistemas, modulos, await _severidades(db), desde, hasta, historico=historico)
    d["por_tipo"] = R.por_tipo(todos)
    return d


def _nombre_archivo(d, op: Opciones, ext: str) -> str:
    base = f"{op.titulo or 'Mesa de Ayuda'} {d['periodo']['titulo']}" + (f" {op.empresa}" if op.empresa else "")
    return re.sub(r"[^A-Za-z0-9 ._-]", "", base.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")).strip() + ext


@router.get("/presentacion/datos")
async def datos(desde: date = Query(...), hasta: date = Query(...), empresa: Optional[str] = None,
                db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _permiso(user)
    return {"data": await _datos(db, desde, hasta, empresa)}


@router.post("/presentacion/html", response_class=HTMLResponse)
async def vista_previa(op: Opciones, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _permiso(user)
    d = await _datos(db, op.desde, op.hasta, op.empresa)
    return HTMLResponse(R.armar_html(d, op.model_dump()))


@router.post("/presentacion/pdf")
async def pdf(op: Opciones, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _permiso(user)
    d = await _datos(db, op.desde, op.hasta, op.empresa)
    contenido = R.armar_html(d, op.model_dump())
    try:
        async with httpx.AsyncClient(timeout=90) as cli:
            r = await cli.post(GOTENBERG, files={"files": ("index.html", contenido.encode("utf-8"), "text/html")},
                               data={"preferCssPageSize": "true", "printBackground": "true",
                                     "marginTop": "0", "marginBottom": "0", "marginLeft": "0", "marginRight": "0"})
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="El generador de PDF no responde; intenta en un momento")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="No se pudo generar el PDF")
    nombre = _nombre_archivo(d, op, ".pdf")
    return Response(r.content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{nombre}"'})
