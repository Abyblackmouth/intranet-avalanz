"""Conversacion del ticket: comentarios publicos (solicitante <-> TI) y notas
internas (solo TI).

Las notas internas se filtran aqui, en el backend: quien levanto el ticket
nunca las recibe (ni en la API, ni en correos, ni en la bitacora). Los
comentarios no pausan el SLA."""
import uuid
from typing import List

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mesa_de_soporte import IncidentComment, IncidentActivityLog
from app.routes.mesa_de_soporte import mesa_de_soporte as _m
from app.services.control_accesos.firma import almacen as _almacen

router = APIRouter(prefix="/incidencias", tags=["Comentarios"])
EXT_PERMITIDAS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"}
MAX_BYTES = 50 * 1024 * 1024
BUCKET = getattr(_almacen, "BUCKET", "dirdoc")


async def _acceso(incident_id: str, db: AsyncSession, user: dict):
    """Mismas reglas que el detalle del ticket. Regresa (ticket, es_ti)."""
    inc = (await db.execute(select(_m.Incident).where(_m.Incident.id == incident_id))).scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    roles = set(user.get("roles") or [])
    uid = str(user.get("user_id"))
    del_modulo = bool(roles & _m.MODULE_WIDE_ROLES) or "super_admin" in roles
    es_solicitante = str(inc.requester_id) == uid
    es_asignado = bool(inc.assigned_to_user_id) and str(inc.assigned_to_user_id) == uid
    if not (del_modulo or es_solicitante or es_asignado):
        if not ("it-service-desk:jefe-empresa" in roles and str(inc.company_id) in await _m._empresas_jefe(user)):
            raise HTTPException(status_code=403, detail="No tienes acceso a este ticket")
    rol_ti = del_modulo or es_asignado or any(
        r.startswith("it-service-desk:") and r != "it-service-desk:jefe-empresa" for r in roles)
    # Quien levanto el ticket nunca es "TI" en su propio ticket: no ve notas internas
    return inc, bool(rol_ti and not es_solicitante)


def _json(c: IncidentComment) -> dict:
    return {"id": str(c.id), "autor": c.author_name, "autor_id": str(c.author_id) if c.author_id else None,
            "rol": c.author_rol, "texto": c.body or "", "interna": bool(c.is_internal),
            "pide_respuesta": bool(c.pide_respuesta), "adjuntos": c.attachments or [],
            "creado": c.created_at.isoformat() if c.created_at else None}


@router.get("/{incident_id}/comentarios")
async def listar(incident_id: str, db: AsyncSession = Depends(_m.get_db), user: dict = Depends(_m.get_current_user)):
    inc, es_ti = await _acceso(incident_id, db, user)
    filas = (await db.execute(select(IncidentComment).where(IncidentComment.incident_id == inc.id)
                              .order_by(IncidentComment.created_at))).scalars().all()
    if not es_ti:
        filas = [c for c in filas if not c.is_internal]
    # Esperando respuesta: el ultimo comentario publico es de TI y pidio respuesta
    esperando = None
    publicos = [c for c in filas if not c.is_internal]
    if publicos and publicos[-1].author_rol == "ti" and publicos[-1].pide_respuesta:
        esperando = {"desde": publicos[-1].created_at.isoformat(), "por": inc.requester_name}
    return {"data": {"comentarios": [_json(c) for c in filas], "puede_nota_interna": es_ti, "esperando": esperando}}


@router.post("/{incident_id}/comentarios")
async def comentar(
    incident_id: str,
    texto: str = Form(""),
    interna: bool = Form(False),
    pide_respuesta: bool = Form(False),
    files: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(_m.get_db),
    user: dict = Depends(_m.get_current_user),
):
    inc, es_ti = await _acceso(incident_id, db, user)
    texto = (texto or "").strip()
    files = [f for f in (files or []) if f and f.filename]
    if not texto and not files:
        raise HTTPException(status_code=422, detail="Escribe un comentario o adjunta un archivo")
    if interna and not es_ti:
        raise HTTPException(status_code=403, detail="Solo TI puede escribir notas internas")

    adjuntos = []
    for f in files:
        nombre = (f.filename or "archivo").replace("/", "_").replace("\\", "_")[-120:]
        ext = ("." + nombre.rsplit(".", 1)[-1].lower()) if "." in nombre else ""
        if ext not in EXT_PERMITIDAS:
            raise HTTPException(status_code=422, detail=f"Tipo de archivo no permitido: {nombre}")
        datos = await f.read()
        if len(datos) > MAX_BYTES:
            raise HTTPException(status_code=422, detail=f"{nombre} pesa más de 50 MB")
        key = f"it-service-desk/comentarios/{inc.folio}/{uuid.uuid4().hex[:8]}_{nombre}"
        _almacen.guardar(datos, key, f.content_type or "application/octet-stream")
        adjuntos.append({"object_key": key, "bucket": BUCKET, "mime_type": f.content_type or "",
                         "nombre": nombre, "size_bytes": len(datos)})

    c = IncidentComment(incident_id=inc.id, author_id=user.get("user_id"), author_name=user.get("full_name") or "Usuario",
                        author_rol="ti" if es_ti else "solicitante", body=texto, is_internal=bool(interna),
                        pide_respuesta=bool(pide_respuesta and es_ti and not interna), attachments=adjuntos)
    db.add(c)
    if not interna:   # las notas internas no van a la bitacora, que tambien ve el solicitante
        db.add(IncidentActivityLog(
            incident_id=inc.id, action="comentario", performed_by=user.get("user_id"),
            performed_by_name=user.get("full_name") or "Usuario", performed_by_role="ti" if es_ti else "solicitante",
            module_slug="it-service-desk", detail={"adjuntos": len(adjuntos), "pide_respuesta": c.pide_respuesta},
        ))
    await db.commit()
    await db.refresh(c)
    await _avisar(inc, c)
    try:
        await _m._broadcast_ticket_update(inc)
    except Exception:
        pass
    return {"data": _json(c)}


async def _avisar(inc, c: IncidentComment) -> None:
    """Avisa a la otra parte: campana (en tiempo real) y, si es publico, correo."""
    from app.assignment import _notify_inapp
    datos = {"incident_id": str(inc.id), "folio": inc.folio}
    resumen = (c.body or f"Adjuntó {len(c.attachments or [])} archivo(s)")[:160]
    try:
        if c.is_internal:
            if inc.assigned_to_user_id and str(inc.assigned_to_user_id) != str(c.author_id):
                await _notify_inapp(str(inc.assigned_to_user_id), f"Nota interna en #{inc.folio}",
                                    f"{c.author_name}: {resumen}", "info", datos)
            return
        if c.author_rol == "ti":
            destino = inc.requester_id
            titulo = f"{'Te piden información' if c.pide_respuesta else 'Nuevo comentario'} en tu ticket #{inc.folio}"
        else:
            destino = inc.assigned_to_user_id
            titulo = f"{c.author_name} comentó el ticket #{inc.folio}"
        if not destino or str(destino) == str(c.author_id):
            return
        await _notify_inapp(str(destino), titulo, resumen, "warning" if c.pide_respuesta else "info", datos)
        perfil = await _m._get_requester_profile(str(destino))
        if perfil.get("email"):
            async with httpx.AsyncClient(timeout=5.0) as cli:
                await cli.post("http://email-service:8000/api/v1/email/system-notification", json={
                    "to_email": perfil["email"], "full_name": perfil.get("full_name") or "",
                    "subject": titulo,
                    "message": f"{c.author_name} escribió en el ticket #{inc.folio} · {inc.title}:",
                    "alert_type": "warning" if c.pide_respuesta else "info",
                    "fields": [
                        {"label": "Comentario", "value": c.body or "(sin texto)", "mono": False},
                        {"label": "Adjuntos", "value": str(len(c.attachments or [])), "mono": False},
                        {"label": "Folio", "value": inc.folio, "mono": True},
                    ],
                })
    except Exception:
        pass   # el comentario ya se guardo; si el aviso falla no se pierde nada
