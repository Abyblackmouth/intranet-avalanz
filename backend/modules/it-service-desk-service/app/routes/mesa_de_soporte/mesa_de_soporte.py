import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.database import get_db
from app.models.mesa_de_soporte import (
    Incident, TicketSeverity, TicketSystem, TicketModule, FolioCounter,
    IncidentAttachment, IncidentActivityLog, IncidentResolutionToken,
)
from shared.middleware.jwt_validator import JWTValidator, get_token_from_request

router = APIRouter(prefix="/mesa-de-soporte", tags=["Mesa De Soporte"])

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()


@router.get("/")
async def list_mesa_de_soporte():
    return {"data": [], "message": "Listado de Mesa De Soporte"}


# ------------------------------------------------------------------
# Catalogo de severidades -- para el formulario de creacion
# ------------------------------------------------------------------

@router.get("/severidades")
async def list_severities(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    result = await db.execute(select(TicketSeverity).where(TicketSeverity.is_active == True).order_by(TicketSeverity.code))
    return {"data": [
        {"id": s.id, "code": s.code, "name": s.name} for s in result.scalars().all()
    ]}


# ------------------------------------------------------------------
# Listado de tickets -- visibilidad por rol (roles-mesa-ayuda.md)
# ------------------------------------------------------------------

MODULE_WIDE_ROLES = {
    "it-service-desk:incident-manager", "it-service-desk:project-manager",
    "it-service-desk:auditoria", "it-service-desk:comite-directivo",
    "it-service-desk:especialista-funcional", "it-service-desk:especialista-tecnico",
    "it-service-desk:tecnico",
}


@router.get("/incidencias")
async def list_incidents(
    status: Optional[str] = None,
    severity_id: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    roles = set(user.get("roles") or [])
    is_module_wide = bool(roles & MODULE_WIDE_ROLES) or "super_admin" in roles
    is_jefe_empresa = "it-service-desk:jefe-empresa" in roles

    query = select(Incident).order_by(Incident.created_at.desc())

    if is_jefe_empresa and not is_module_wide:
        companies = user.get("companies") or []
        if companies:
            query = query.where(Incident.company_id.in_(companies))
    elif not is_module_wide:
        # Solicitante -- solo ve lo suyo
        query = query.where(Incident.requester_id == user.get("user_id"))

    if status:
        query = query.where(Incident.status == status)
    if severity_id:
        query = query.where(
            (Incident.severity_reported_id == severity_id) | (Incident.severity_validated_id == severity_id)
        )
    if search:
        like = f"%{search}%"
        query = query.where((Incident.folio.ilike(like)) | (Incident.title.ilike(like)))

    result = await db.execute(query.limit(200))
    incidents = result.scalars().all()

    # Enriquecer con el nombre real de quien esta asignado -- sin esto el
    # frontend tendria que resolverlo con una llamada aparte por cada fila.
    import httpx
    names_cache: dict = {}
    unique_assignees = {i.assigned_to_user_id for i in incidents if i.assigned_to_user_id}
    if unique_assignees:
        async with httpx.AsyncClient(timeout=5.0) as client:
            for uid in unique_assignees:
                try:
                    resp = await client.get(f"http://admin-service:8000/internal/users/{uid}/profile")
                    names_cache[uid] = resp.json().get("full_name") if resp.status_code == 200 else None
                except Exception:
                    names_cache[uid] = None

    return {"data": [
        {
            "id": i.id, "folio": i.folio, "title": i.title, "status": i.status,
            "system_id": i.system_id, "module_id": i.module_id,
            "severity_reported_id": i.severity_reported_id, "severity_validated_id": i.severity_validated_id,
            "assigned_team": i.assigned_team, "assigned_to_user_id": i.assigned_to_user_id,
            "assigned_to_name": names_cache.get(i.assigned_to_user_id) if i.assigned_to_user_id else None,
            "requester_name": i.requester_name, "requester_company_name": i.requester_company_name,
            "created_at": i.created_at.isoformat(),
            "sla_response_limit": i.sla_response_limit.isoformat() if i.sla_response_limit else None,
            "sla_resolution_limit": i.sla_resolution_limit.isoformat() if i.sla_resolution_limit else None,
            "is_sla_breached": i.is_sla_breached,
        } for i in incidents
    ]}


@router.get("/incidencias/{incident_id}")
async def get_incident_detail(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    roles = set(user.get("roles") or [])
    is_module_wide = bool(roles & MODULE_WIDE_ROLES) or "super_admin" in roles
    is_jefe_empresa = "it-service-desk:jefe-empresa" in roles
    is_owner = incident.requester_id == user.get("user_id")

    if not is_module_wide and not is_owner:
        if is_jefe_empresa:
            if incident.company_id not in (user.get("companies") or []):
                raise HTTPException(status_code=403, detail="No tienes acceso a este ticket")
        else:
            raise HTTPException(status_code=403, detail="No tienes acceso a este ticket")

    attach_result = await db.execute(select(IncidentAttachment).where(IncidentAttachment.incident_id == incident_id))
    attachments = attach_result.scalars().all()

    log_result = await db.execute(
        select(IncidentActivityLog).where(IncidentActivityLog.incident_id == incident_id).order_by(IncidentActivityLog.performed_at)
    )
    logs = log_result.scalars().all()

    return {
        "id": incident.id, "folio": incident.folio, "title": incident.title, "description": incident.description,
        "status": incident.status,
        "system_id": incident.system_id, "module_id": incident.module_id, "reported_type": incident.reported_type,
        "severity_reported_id": incident.severity_reported_id, "severity_validated_id": incident.severity_validated_id,
        "requester_name": incident.requester_name, "requester_phone": incident.requester_phone,
        "requester_puesto": incident.requester_puesto, "requester_area": incident.requester_area,
        "requester_company_name": incident.requester_company_name,
        "assigned_team": incident.assigned_team, "assigned_to_user_id": incident.assigned_to_user_id,
        "assigned_at": incident.assigned_at.isoformat() if incident.assigned_at else None,
        "sla_response_limit": incident.sla_response_limit.isoformat() if incident.sla_response_limit else None,
        "sla_resolution_limit": incident.sla_resolution_limit.isoformat() if incident.sla_resolution_limit else None,
        "is_sla_breached": incident.is_sla_breached,
        "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
        "resolution_type": incident.resolution_type,
        "closed_at": incident.closed_at.isoformat() if incident.closed_at else None,
        "created_at": incident.created_at.isoformat(),
        "attachments": [
            {"id": a.id, "attachment_type": a.attachment_type, "object_key": a.object_key, "bucket": a.bucket, "mime_type": a.mime_type}
            for a in attachments
        ],
        "activity_log": [
            {
                "action": l.action, "performed_by_name": l.performed_by_name, "performed_by_role": l.performed_by_role,
                "performed_at": l.performed_at.isoformat(), "detail": l.detail,
            } for l in logs
        ],
    }


# ------------------------------------------------------------------
# Subida de evidencia -- llamada al upload-service, mismo patron que
# ya usa Legal (ver upload-service.md)
# ------------------------------------------------------------------

async def _upload_evidence_files(
    files: List[UploadFile],
    company_slug: str,
    folio: str,
    raw_token: str,
) -> List[Dict[str, Any]]:
    """Sube cada archivo al upload-service y regresa la lista de resultados
    (object_key, bucket, mime_type, size_bytes) para guardarlos despues en
    incident_attachments."""
    uploaded = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for f in files:
            file_bytes = await f.read()
            resp = await client.post(
                "http://upload-service:8000/api/v1/upload/",
                headers={"Authorization": f"Bearer {raw_token}"},
                files={"file": (f.filename, file_bytes, f.content_type)},
                data={
                    "company_slug": company_slug,
                    "module_slug": "it-service-desk",
                    "submodule_slug": f"incidencias/{folio}",
                },
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"No se pudo subir el archivo {f.filename}")
            data = resp.json().get("data", {})
            uploaded.append(data)
    return uploaded


# ------------------------------------------------------------------
# Perfil del solicitante -- llamada interna a admin-service
# ------------------------------------------------------------------

async def _get_requester_profile(user_id: str) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"http://admin-service:8000/internal/users/{user_id}/profile")
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="No se pudo obtener el perfil del solicitante")
            return resp.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Error al comunicarse con admin-service")


# ------------------------------------------------------------------
# Folio atomico -- por familia (o codigo propio de empresa si no tiene)
# ------------------------------------------------------------------

async def _generate_folio(db: AsyncSession, prefix: str, family_clave: str) -> str:
    """Genera el siguiente folio de forma atomica -- SELECT ... FOR UPDATE
    sobre folio_counters, tal como documentado en el motor de asignacion."""
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT id, last_number FROM folio_counters
        WHERE prefix = :prefix AND family_clave = :family_clave
        FOR UPDATE
    """), {"prefix": prefix, "family_clave": family_clave})
    row = result.fetchone()
    if row:
        counter_id, last_number = row
        next_number = last_number + 1
        await db.execute(text("""
            UPDATE folio_counters SET last_number = :next_number, updated_at = now()
            WHERE id = :counter_id
        """), {"next_number": next_number, "counter_id": counter_id})
    else:
        next_number = 1
        await db.execute(text("""
            INSERT INTO folio_counters (id, prefix, family_clave, last_number, updated_at)
            VALUES (:id, :prefix, :family_clave, :next_number, now())
        """), {"id": str(uuid.uuid4()), "prefix": prefix, "family_clave": family_clave, "next_number": next_number})
    return f"{prefix}-{family_clave}-{next_number:06d}"


# ------------------------------------------------------------------
# Notificacion 1 -- creacion del ticket (submodulo-incidencias-notificaciones.md)
# ------------------------------------------------------------------

async def _notify_ticket_created(
    to_email: str, full_name: str, folio: str, title: str,
    system_name: str, module_name: Optional[str], severity_name: str,
    created_at: datetime,
) -> None:
    modulo_txt = f" / {module_name}" if module_name else ""
    message = (
        f"Folio: {folio}\n"
        f"Titulo: {title}\n"
        f"Sistema / Modulo: {system_name}{modulo_txt}\n"
        f"Severidad propuesta: {severity_name}\n"
        f"Fecha de creacion: {created_at.strftime('%d/%m/%Y %H:%M')}"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": to_email,
                    "full_name": full_name,
                    "subject": f"Se ha creado un ticket para soporte tecnico #{folio}",
                    "message": message,
                    "alert_type": "info",
                },
            )
    except Exception:
        # Si el correo falla, el ticket ya se guardo bien -- no se pierde
        # nada, solo no llega el aviso.
        pass


# ------------------------------------------------------------------
# Notificacion 1 -- creacion del ticket (submodulo-incidencias-notificaciones.md)
# ------------------------------------------------------------------

async def _notify_ticket_created(
    to_email: str, full_name: str, folio: str, title: str,
    system_name: str, module_name: Optional[str], severity_name: str,
    created_at: datetime,
) -> None:
    modulo_txt = f" / {module_name}" if module_name else ""
    message = (
        f"Folio: {folio}\n"
        f"Titulo: {title}\n"
        f"Sistema / Modulo: {system_name}{modulo_txt}\n"
        f"Severidad propuesta: {severity_name}\n"
        f"Fecha de creacion: {created_at.strftime('%d/%m/%Y %H:%M')}"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": to_email,
                    "full_name": full_name,
                    "subject": f"Se ha creado un ticket para soporte tecnico #{folio}",
                    "message": message,
                    "alert_type": "info",
                },
            )
    except Exception:
        # Si el correo falla, el ticket ya se guardo bien -- no se pierde
        # nada, solo no llega el aviso.
        pass


# ------------------------------------------------------------------
# Asignacion manual -- Incident Manager asigna un ticket del backlog
# ------------------------------------------------------------------

class ManualAssignRequest(BaseModel):
    assigned_team: str
    assigned_to_user_id: str


@router.patch("/incidencias/{incident_id}/asignar")
async def assign_incident_manual(
    incident_id: str,
    body: ManualAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    roles = user.get("roles") or []
    if "it-service-desk:incident-manager" not in roles and "super_admin" not in roles:
        raise HTTPException(status_code=403, detail="Solo Incident Manager puede asignar tickets manualmente")

    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    from app.assignment import finalize_assignment
    await finalize_assignment(
        db, incident,
        assigned_team=body.assigned_team,
        assigned_to_user_id=body.assigned_to_user_id,
        actor_id=user.get("user_id"),
        actor_name=user.get("full_name", ""),
        actor_role="incident_manager",
        action="asignacion_manual",
    )
    return {"success": True, "message": "Ticket asignado"}


# ------------------------------------------------------------------
# Atender desde el correo -- sin login, via token de un solo uso
# ------------------------------------------------------------------

class ResolveViaTokenRequest(BaseModel):
    resolution_type: str  # causa_raiz | workaround
    rca_text: Optional[str] = None


@router.get("/atender/{token}")
async def get_incident_by_token(token: str, db: AsyncSession = Depends(get_db)):
    from app.models.mesa_de_soporte import IncidentResolutionToken
    result = await db.execute(select(IncidentResolutionToken).where(IncidentResolutionToken.token == token))
    tok = result.scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=404, detail="Enlace invalido")
    if tok.used_at is not None:
        raise HTTPException(status_code=410, detail="Este enlace ya fue utilizado")
    if tok.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Este enlace ha expirado")

    inc_result = await db.execute(select(Incident).where(Incident.id == tok.incident_id))
    incident = inc_result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    return {
        "folio": incident.folio,
        "title": incident.title,
        "description": incident.description,
        "status": incident.status,
        "requester_name": incident.requester_name,
        "requester_area": incident.requester_area,
        "requester_company_name": incident.requester_company_name,
        "created_at": incident.created_at.isoformat(),
        "sla_resolution_limit": incident.sla_resolution_limit.isoformat() if incident.sla_resolution_limit else None,
        "already_resolved": incident.status in ("resuelto", "cerrado"),
    }


@router.post("/atender/{token}/resolver")
async def resolve_via_token(token: str, body: ResolveViaTokenRequest, db: AsyncSession = Depends(get_db)):
    from app.models.mesa_de_soporte import IncidentResolutionToken
    result = await db.execute(select(IncidentResolutionToken).where(IncidentResolutionToken.token == token))
    tok = result.scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=404, detail="Enlace invalido")
    if tok.used_at is not None:
        raise HTTPException(status_code=410, detail="Este enlace ya fue utilizado")
    if tok.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Este enlace ha expirado")

    inc_result = await db.execute(select(Incident).where(Incident.id == tok.incident_id))
    incident = inc_result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if incident.status in ("resuelto", "cerrado"):
        raise HTTPException(status_code=400, detail="Este ticket ya fue resuelto")

    incident.status = "resuelto"
    incident.resolved_at = datetime.now(timezone.utc)
    incident.resolution_type = body.resolution_type
    if body.rca_text:
        incident.rca_text = body.rca_text
    incident.reopen_window_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    tok.used_at = datetime.now(timezone.utc)

    resolver_profile = await _get_requester_profile(tok.created_for_user_id)

    from app.models.mesa_de_soporte import IncidentActivityLog
    db.add(IncidentActivityLog(
        incident_id=incident.id,
        action="ticket_resuelto_via_token",
        performed_by=tok.created_for_user_id,
        performed_by_name=resolver_profile.get("full_name") or "Desconocido",
        performed_by_role="asignado",
        module_slug="it-service-desk",
        detail={"resolution_type": body.resolution_type, "via": "enlace_correo"},
    ))
    await db.commit()
    return {"success": True, "message": "Ticket marcado como resuelto"}


# ------------------------------------------------------------------
# Crear ticket
# ------------------------------------------------------------------

@router.post("/incidencias")
async def create_incident(
    title: str = Form(...),
    system_id: str = Form(...),
    module_id: Optional[str] = Form(None),
    reported_type: Optional[str] = Form(None),
    severity_reported_id: str = Form(...),
    description: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    raw_token: str = Depends(get_token_from_request),
):
    user_id = user.get("user_id")
    company_id = user.get("companies", [None])[0] if user.get("companies") else None
    if not company_id:
        raise HTTPException(status_code=400, detail="El usuario no tiene empresa asignada")

    profile = await _get_requester_profile(user_id)

    severity_result = await db.execute(select(TicketSeverity).where(TicketSeverity.id == severity_reported_id))
    severity = severity_result.scalar_one_or_none()
    if not severity:
        raise HTTPException(status_code=404, detail="Severidad no encontrada")

    family_clave = profile.get("family_clave")
    folio = await _generate_folio(db, "INC", family_clave)

    now = datetime.now(timezone.utc)
    sla_response_limit = now + timedelta(minutes=severity.response_sla_minutes)
    sla_resolution_limit = now + timedelta(hours=severity.resolution_sla_hours)

    incident = Incident(
        folio=folio,
        title=title,
        company_id=company_id,
        requester_id=user_id,
        requester_name=profile.get("full_name"),
        requester_phone=profile.get("phone"),
        requester_puesto=profile.get("puesto"),
        requester_area=profile.get("departamento"),
        requester_company_name=profile.get("company_name"),
        system_id=system_id,
        module_id=module_id,
        reported_type=reported_type,
        description=description,
        severity_reported_id=severity_reported_id,
        sla_response_limit=sla_response_limit,
        sla_resolution_limit=sla_resolution_limit,
        status="en_backlog",
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)

    # Evidencia -- opcional, una o varias imagenes (Fase 1 del formulario)
    if files:
        uploaded = await _upload_evidence_files(
            files, profile.get("company_slug"), folio, raw_token
        )
        for f in uploaded:
            db.add(IncidentAttachment(
                incident_id=incident.id,
                attachment_type="evidencia_reporte",
                reopen_cycle=0,
                object_key=f["object_key"],
                bucket=f["bucket"],
                mime_type=f["content_type"],
                size_bytes=f["size_bytes"],
                uploaded_by=user_id,
                uploaded_at=datetime.now(timezone.utc),
            ))
        await db.commit()

    # Bitacora -- se registra la creacion, con el solicitante como actor real
    from app.models.mesa_de_soporte import IncidentActivityLog
    db.add(IncidentActivityLog(
        incident_id=incident.id,
        action="ticket_creado",
        performed_by=user_id,
        performed_by_name=profile.get("full_name"),
        performed_by_role="solicitante",
        module_slug="it-service-desk",
        detail={"evidencia_adjunta": len(files) if files else 0},
    ))
    await db.commit()

    try:
        from app.rabbitmq import publish_incident_created
        await publish_incident_created(str(incident.id))
    except Exception:
        # Si RabbitMQ no esta disponible, el ticket ya se guardo bien --
        # se queda en_backlog para asignacion manual, no se pierde nada.
        pass

    # Notificacion 1: correo de creacion al solicitante
    system_result = await db.execute(select(TicketSystem).where(TicketSystem.id == system_id))
    system_obj = system_result.scalar_one_or_none()
    module_name = None
    if module_id:
        module_result = await db.execute(select(TicketModule).where(TicketModule.id == module_id))
        module_obj = module_result.scalar_one_or_none()
        module_name = module_obj.name if module_obj else None

    await _notify_ticket_created(
        to_email=user.get("email"),
        full_name=profile.get("full_name"),
        folio=incident.folio,
        title=incident.title,
        system_name=system_obj.name if system_obj else "N/A",
        module_name=module_name,
        severity_name=severity.name,
        created_at=incident.created_at,
    )

    return {
        "success": True,
        "message": "Ticket creado",
        "data": {
            "id": incident.id,
            "folio": incident.folio,
            "status": incident.status,
            "sla_response_limit": incident.sla_response_limit.isoformat(),
            "sla_resolution_limit": incident.sla_resolution_limit.isoformat(),
            "evidencia_subida": len(files) if files else 0,
        },
    }
