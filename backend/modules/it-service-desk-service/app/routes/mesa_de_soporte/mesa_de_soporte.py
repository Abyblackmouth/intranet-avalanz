import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.database import get_db
from app.models.mesa_de_soporte import (
    Incident, TicketSeverity, TicketSystem, TicketModule, FolioCounter,
    IncidentAttachment, IncidentActivityLog, IncidentResolutionToken, SystemSpecialist,
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
    order: Optional[str] = "desc",
    limit: Optional[int] = 200,
    offset: Optional[int] = 0,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    roles = set(user.get("roles") or [])
    is_module_wide = bool(roles & MODULE_WIDE_ROLES) or "super_admin" in roles
    is_jefe_empresa = "it-service-desk:jefe-empresa" in roles

    order_col = Incident.created_at.asc() if order == "asc" else Incident.created_at.desc()
    query = select(Incident).order_by(order_col)

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

    count_query = query.with_only_columns(func.count()).order_by(None)
    total_result = await db.execute(count_query)
    total_count = total_result.scalar_one()

    result = await db.execute(query.limit(limit).offset(offset))
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
    ], "total_count": total_count}


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

    requester_profile = await _get_requester_profile(incident.requester_id)

    assignee_profile = {}
    if incident.assigned_to_user_id:
        assignee_profile = await _get_requester_profile(incident.assigned_to_user_id)

    return {
        "id": incident.id, "folio": incident.folio, "title": incident.title, "description": incident.description,
        "status": incident.status,
        "system_id": incident.system_id, "module_id": incident.module_id, "reported_type": incident.reported_type,
        "severity_reported_id": incident.severity_reported_id, "severity_validated_id": incident.severity_validated_id,
        "requester_name": incident.requester_name, "requester_phone": incident.requester_phone,
        "requester_puesto": incident.requester_puesto, "requester_area": incident.requester_area,
        "requester_company_name": incident.requester_company_name,
        "requester_photo_object_key": requester_profile.get("photo_object_key"),
        "assigned_team": incident.assigned_team, "assigned_to_user_id": incident.assigned_to_user_id,
        "assigned_to_name": assignee_profile.get("full_name"),
        "assigned_to_phone": assignee_profile.get("phone"),
        "assigned_to_puesto": assignee_profile.get("puesto"),
        "assigned_to_photo_object_key": assignee_profile.get("photo_object_key"),
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
    name_prefix: str = "evidencia",
) -> List[Dict[str, Any]]:
    """Sube cada archivo al upload-service y regresa la lista de resultados
    (object_key, bucket, mime_type, size_bytes) para guardarlos despues en
    incident_attachments. El nombre original del archivo se descarta --
    siempre se guarda como {name_prefix}_{numero}{extension}, numerado
    secuencialmente segun el orden en que se subieron."""
    uploaded = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i, f in enumerate(files, start=1):
            file_bytes = await f.read()
            ext = ""
            if f.filename and "." in f.filename:
                ext = "." + f.filename.rsplit(".", 1)[-1].lower()
            controlled_name = f"{name_prefix}_{i}{ext}"
            resp = await client.post(
                "http://upload-service:8000/api/v1/upload/",
                headers={"Authorization": f"Bearer {raw_token}"},
                files={"file": (controlled_name, file_bytes, f.content_type)},
                data={
                    "company_slug": company_slug,
                    "module_slug": "it-service-desk",
                    "submodule_slug": f"incidencias/{folio}",
                },
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"No se pudo subir el archivo {controlled_name}")
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
    fields = [
        {"label": "Folio", "value": folio, "mono": True},
        {"label": "Titulo", "value": title, "mono": False},
        {"label": "Sistema", "value": f"{system_name}{' / ' + module_name if module_name else ''}", "mono": False},
        {"label": "Severidad", "value": severity_name, "mono": False},
        {"label": "Creado", "value": created_at.strftime('%d/%m/%Y %H:%M'), "mono": False},
    ]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": to_email,
                    "full_name": full_name,
                    "subject": f"Se ha creado un ticket para soporte tecnico #{folio}",
                    "message": "Registramos tu ticket con los siguientes datos:",
                    "alert_type": "info",
                    "fields": fields,
                },
            )
    except Exception:
        # Si el correo falla, el ticket ya se guardo bien -- no se pierde
        # nada, solo no llega el aviso.
        pass


# ------------------------------------------------------------------
# Notificacion 1 -- creacion del ticket (submodulo-incidencias-notificaciones.md)
# ------------------------------------------------------------------

async def _notify_ticket_resolved(to_email: str, full_name: str, folio: str, title: str, resolution_type: str, rca_text: Optional[str]) -> None:
    """Correo al solicitante cuando su ticket se resuelve -- antes solo
    existia la notificacion in-app; un usuario real reporto no haber
    recibido ningun aviso, y al revisar, el correo nunca se habia
    construido para este paso (si para creacion y (re)asignacion)."""
    tipo_txt = "Causa raiz" if resolution_type == "causa_raiz" else "Workaround"
    fields = [
        {"label": "Folio", "value": folio, "mono": True},
        {"label": "Titulo", "value": title, "mono": False},
        {"label": "Resolucion", "value": tipo_txt, "mono": False},
    ]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": to_email,
                    "full_name": full_name,
                    "subject": f"Tu ticket #{folio} fue resuelto",
                    "message": f"Notas: {rca_text}" if rca_text else "",
                    "alert_type": "success",
                    "fields": fields,
                },
            )
    except Exception:
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

    sev_result = await db.execute(
        select(TicketSeverity).where(TicketSeverity.id == (incident.severity_validated_id or incident.severity_reported_id))
    )
    severity = sev_result.scalar_one_or_none()

    attach_result = await db.execute(
        select(IncidentAttachment).where(
            IncidentAttachment.incident_id == incident.id,
            IncidentAttachment.attachment_type == "evidencia_reporte",
        )
    )
    attachments = attach_result.scalars().all()

    return {
        "folio": incident.folio,
        "title": incident.title,
        "description": incident.description,
        "status": incident.status,
        "requester_name": incident.requester_name,
        "requester_phone": incident.requester_phone,
        "requester_puesto": incident.requester_puesto,
        "requester_area": incident.requester_area,
        "requester_company_name": incident.requester_company_name,
        "severity_code": severity.code if severity else None,
        "severity_name": severity.name if severity else None,
        "created_at": incident.created_at.isoformat(),
        "sla_resolution_limit": incident.sla_resolution_limit.isoformat() if incident.sla_resolution_limit else None,
        "already_resolved": incident.status in ("resuelto", "cerrado"),
        "attachments": [{"id": a.id, "object_key": a.object_key, "bucket": a.bucket} for a in attachments],
    }


@router.post("/atender/{token}/redirigir")
async def redirect_via_token(token: str, body: dict, db: AsyncSession = Depends(get_db)):
    """Cuando quien recibe el ticket determina que no le corresponde:
    - Si es "Tecnico" (segmento especifico, no especialista completo)
      -> va automatico al Especialista catch-all de su mismo equipo.
    - Si es un Especialista completo -> va siempre a Incident Manager.
    En ambos casos se registra el motivo y se notifica a quien lo recibe."""
    reason = (body or {}).get("reason", "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Debes indicar un motivo")

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

    import httpx
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            "http://admin-service:8000/internal/users/by-module-role",
            params={"module_slug": "it-service-desk", "role_slug": incident.assigned_team},
        )
        especialistas = resp.json() if resp.status_code == 200 else []
        is_full_specialist = any(u["id"] == tok.created_for_user_id for u in especialistas)

        if is_full_specialist:
            im_resp = await client.get(
                "http://admin-service:8000/internal/users/by-module-role",
                params={"module_slug": "it-service-desk", "role_slug": "incident-manager"},
            )
            im_users = im_resp.json() if im_resp.status_code == 200 else []
            if not im_users:
                raise HTTPException(status_code=500, detail="No hay Incident Manager configurado")
            target_user_id = im_users[0]["id"]
        else:
            spec_result = await db.execute(
                select(SystemSpecialist).where(
                    SystemSpecialist.team_type == incident.assigned_team,
                    SystemSpecialist.system_id.is_(None),
                    SystemSpecialist.module_id.is_(None),
                    SystemSpecialist.is_active == True,
                )
            )
            catchall = spec_result.scalars().first()
            if not catchall:
                raise HTTPException(status_code=400, detail="No hay un especialista general disponible para este equipo")
            target_user_id = catchall.specialist_user_id

    from app.assignment import finalize_assignment, _get_user_profile
    redirecting_profile = await _get_user_profile(tok.created_for_user_id)

    await finalize_assignment(
        db, incident,
        assigned_team=incident.assigned_team,
        assigned_to_user_id=target_user_id,
        actor_id=tok.created_for_user_id,
        actor_name=redirecting_profile.get("full_name", "Desconocido"),
        actor_role="asignado",
        action="redirigido_no_corresponde",
        reason=reason,
    )
    return {"success": True, "message": "Ticket redirigido"}


@router.post("/atender/{token}/resolver")
async def resolve_via_token(
    token: str,
    resolution_type: str = Form(...),
    rca_text: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
):
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

    resolver_profile = await _get_requester_profile(tok.created_for_user_id)

    # Si hay evidencia de resolucion, se sube usando un token JWT interno
    # generado solo para este instante -- upload-service exige JWT real,
    # y este flujo es sin sesion. El token nunca se persiste ni se
    # regresa a nadie; vive solo en esta variable y expira en 1 minuto.
    if files:
        from shared.utils.jwt import create_access_token
        internal_token = create_access_token(
            payload={"user_id": tok.created_for_user_id, "company_id": resolver_profile.get("company_id", "")},
            secret_key=config.JWT_SECRET_KEY,
            algorithm=config.JWT_ALGORITHM,
            expire_minutes=1,
        )
        uploaded = await _upload_evidence_files(files, resolver_profile.get("company_slug", "avalanz"), incident.folio, internal_token, name_prefix="evidencia_atencion")
        for u in uploaded:
            db.add(IncidentAttachment(
                incident_id=incident.id,
                attachment_type="evidencia_resolucion",
                object_key=u.get("object_key"),
                bucket=u.get("bucket"),
                mime_type=u.get("content_type"),
                size_bytes=u.get("size_bytes"),
                uploaded_by=tok.created_for_user_id,
            ))

    incident.status = "resuelto"
    incident.resolved_at = datetime.now(timezone.utc)
    incident.resolution_type = resolution_type
    if rca_text:
        incident.rca_text = rca_text
    incident.reopen_window_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    tok.used_at = datetime.now(timezone.utc)

    from app.models.mesa_de_soporte import IncidentActivityLog
    db.add(IncidentActivityLog(
        incident_id=incident.id,
        action="ticket_resuelto_via_token",
        performed_by=tok.created_for_user_id,
        performed_by_name=resolver_profile.get("full_name") or "Desconocido",
        performed_by_role="asignado",
        module_slug="it-service-desk",
        detail={"resolution_type": resolution_type, "via": "enlace_correo"},
    ))
    await db.commit()

    from app.assignment import _notify_inapp
    if incident.requester_id:
        await _notify_inapp(
            incident.requester_id, f"Ticket #{incident.folio} resuelto",
            f"{incident.title} — Ya fue marcado como resuelto", "success",
            {"incident_id": str(incident.id), "folio": incident.folio},
        )
        req_profile = await _get_requester_profile(incident.requester_id)
        if req_profile.get("email"):
            await _notify_ticket_resolved(
                req_profile["email"], incident.requester_name, incident.folio,
                incident.title, resolution_type, rca_text,
            )

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
            files, profile.get("company_slug"), folio, raw_token, name_prefix="evidencia_solicitante"
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


# ------------------------------------------------------------------
# Resolver estando logueado (sin pasar por el enlace de correo)
# ------------------------------------------------------------------

@router.post("/incidencias/{incident_id}/resolver")
async def resolve_logged_in(
    incident_id: str,
    resolution_type: str = Form(...),
    rca_text: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    raw_token: str = Depends(get_token_from_request),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if incident.status in ("resuelto", "cerrado"):
        raise HTTPException(status_code=400, detail="Este ticket ya fue resuelto")

    roles = set(user.get("roles") or [])
    is_incident_manager = "it-service-desk:incident-manager" in roles or "super_admin" in roles
    is_assignee = user.get("user_id") == incident.assigned_to_user_id
    if not is_incident_manager and not is_assignee:
        raise HTTPException(status_code=403, detail="Solo la persona asignada o Incident Manager puede resolver este ticket")

    if files:
        profile = await _get_requester_profile(user.get("user_id"))
        uploaded = await _upload_evidence_files(files, profile.get("company_slug", "avalanz"), incident.folio, raw_token, name_prefix="evidencia_atencion")
        for u in uploaded:
            db.add(IncidentAttachment(
                incident_id=incident.id, attachment_type="evidencia_resolucion",
                object_key=u.get("object_key"), bucket=u.get("bucket"),
                mime_type=u.get("content_type"), size_bytes=u.get("size_bytes"),
                uploaded_by=user.get("user_id"),
            ))

    incident.status = "resuelto"
    incident.resolved_at = datetime.now(timezone.utc)
    incident.resolution_type = resolution_type
    if rca_text:
        incident.rca_text = rca_text
    incident.reopen_window_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    # Invalidar cualquier token de atencion pendiente -- ya se resolvio por otro medio
    from app.assignment import _invalidate_previous_tokens
    await _invalidate_previous_tokens(db, incident.id)

    db.add(IncidentActivityLog(
        incident_id=incident.id, action="ticket_resuelto",
        performed_by=user.get("user_id"), performed_by_name=user.get("full_name", ""),
        performed_by_role="incident_manager" if is_incident_manager else "asignado",
        module_slug="it-service-desk",
        detail={"resolution_type": resolution_type},
    ))
    await db.commit()

    from app.assignment import _notify_inapp
    if incident.requester_id:
        await _notify_inapp(
            incident.requester_id, f"Ticket #{incident.folio} resuelto",
            f"{incident.title} — Ya fue marcado como resuelto", "success",
            {"incident_id": str(incident.id), "folio": incident.folio},
        )
        req_profile = await _get_requester_profile(incident.requester_id)
        if req_profile.get("email"):
            await _notify_ticket_resolved(
                req_profile["email"], incident.requester_name, incident.folio,
                incident.title, resolution_type, rca_text,
            )

    return {"success": True, "message": "Ticket marcado como resuelto"}


# ------------------------------------------------------------------
# Reapertura -- solo dentro de la ventana de 24h tras resolver
# ------------------------------------------------------------------

@router.post("/incidencias/{incident_id}/reabrir")
async def reopen_incident(
    incident_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    reason = (body or {}).get("reason", "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Debes indicar un motivo para reabrir")

    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if incident.status != "resuelto":
        raise HTTPException(status_code=400, detail="Solo se puede reabrir un ticket resuelto")
    if not incident.reopen_window_expires_at or incident.reopen_window_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="La ventana de reapertura de 24 horas ya expiro")

    roles = set(user.get("roles") or [])
    is_incident_manager = "it-service-desk:incident-manager" in roles or "super_admin" in roles
    is_requester = user.get("user_id") == incident.requester_id
    if not is_incident_manager and not is_requester:
        raise HTTPException(status_code=403, detail="Solo el solicitante o Incident Manager pueden reabrir este ticket")

    incident.status = "asignado" if incident.assigned_to_user_id else "en_backlog"
    incident.resolved_at = None
    incident.resolution_type = None
    incident.reopen_window_expires_at = None

    db.add(IncidentActivityLog(
        incident_id=incident.id, action="ticket_reabierto",
        performed_by=user.get("user_id"), performed_by_name=user.get("full_name", ""),
        performed_by_role="incident_manager" if is_incident_manager else "solicitante",
        module_slug="it-service-desk", detail={"motivo": reason},
    ))
    await db.commit()
    return {"success": True, "message": "Ticket reabierto"}


# ------------------------------------------------------------------
# Cierre formal -- solo Incident Manager
# ------------------------------------------------------------------

@router.post("/incidencias/{incident_id}/cerrar")
async def close_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    roles = user.get("roles") or []
    if "it-service-desk:incident-manager" not in roles and "super_admin" not in roles:
        raise HTTPException(status_code=403, detail="Solo Incident Manager puede cerrar formalmente un ticket")

    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if incident.status != "resuelto":
        raise HTTPException(status_code=400, detail="Solo se puede cerrar un ticket ya resuelto")

    incident.status = "cerrado"
    incident.closed_at = datetime.now(timezone.utc)

    db.add(IncidentActivityLog(
        incident_id=incident.id, action="ticket_cerrado",
        performed_by=user.get("user_id"), performed_by_name=user.get("full_name", ""),
        performed_by_role="incident_manager", module_slug="it-service-desk", detail={},
    ))
    await db.commit()

    from app.assignment import _notify_inapp
    if incident.requester_id:
        await _notify_inapp(
            incident.requester_id, f"Ticket #{incident.folio} cerrado",
            f"{incident.title} — Se cerró formalmente el caso", "neutral",
            {"incident_id": str(incident.id), "folio": incident.folio},
        )

    return {"success": True, "message": "Ticket cerrado formalmente"}


# ------------------------------------------------------------------
# Escalamiento
# ------------------------------------------------------------------

@router.post("/incidencias/{incident_id}/escalar")
async def escalate_incident(
    incident_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    reason = (body or {}).get("reason", "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Debes indicar un motivo para escalar")

    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if incident.status in ("resuelto", "cerrado"):
        raise HTTPException(status_code=400, detail="No se puede escalar un ticket ya resuelto o cerrado")

    roles = set(user.get("roles") or [])
    is_incident_manager = "it-service-desk:incident-manager" in roles or "super_admin" in roles
    is_assignee = user.get("user_id") == incident.assigned_to_user_id
    if not is_incident_manager and not is_assignee:
        raise HTTPException(status_code=403, detail="Solo la persona asignada o Incident Manager puede escalar este ticket")

    # Escalar reasigna a Incident Manager como coordinador del siguiente nivel (N3)
    import httpx
    async with httpx.AsyncClient(timeout=5.0) as client:
        im_resp = await client.get(
            "http://admin-service:8000/internal/users/by-module-role",
            params={"module_slug": "it-service-desk", "role_slug": "incident-manager"},
        )
        im_users = im_resp.json() if im_resp.status_code == 200 else []

    incident.status = "escalado"

    db.add(IncidentActivityLog(
        incident_id=incident.id, action="ticket_escalado",
        performed_by=user.get("user_id"), performed_by_name=user.get("full_name", ""),
        performed_by_role="incident_manager" if is_incident_manager else "asignado",
        module_slug="it-service-desk", detail={"motivo": reason},
    ))
    await db.commit()

    if im_users:
        from app.assignment import _get_user_profile
        im_profile = await _get_user_profile(im_users[0]["id"])
        if im_profile.get("email"):
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.post(
                        "http://email-service:8000/api/v1/email/system-notification",
                        json={
                            "to_email": im_profile["email"], "full_name": im_profile.get("full_name", ""),
                            "subject": f"Ticket escalado: #{incident.folio}",
                            "message": f"Folio: {incident.folio}\\nMotivo: {reason}",
                            "alert_type": "warning",
                        },
                    )
            except Exception:
                pass

    return {"success": True, "message": "Ticket escalado"}


# ------------------------------------------------------------------
# Validar/ajustar severidad en triage -- solo Incident Manager
# ------------------------------------------------------------------

@router.patch("/incidencias/{incident_id}/severidad")
async def validate_severity(
    incident_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    severity_id = (body or {}).get("severity_id", "").strip()
    if not severity_id:
        raise HTTPException(status_code=400, detail="Debes indicar la severidad validada")

    roles = user.get("roles") or []
    if "it-service-desk:incident-manager" not in roles and "super_admin" not in roles:
        raise HTTPException(status_code=403, detail="Solo Incident Manager puede validar la severidad")

    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    sev_result = await db.execute(select(TicketSeverity).where(TicketSeverity.id == severity_id))
    severity = sev_result.scalar_one_or_none()
    if not severity:
        raise HTTPException(status_code=404, detail="Severidad no encontrada")

    old_severity_id = incident.severity_validated_id or incident.severity_reported_id
    incident.severity_validated_id = severity_id

    db.add(IncidentActivityLog(
        incident_id=incident.id, action="severidad_validada",
        performed_by=user.get("user_id"), performed_by_name=user.get("full_name", ""),
        performed_by_role="incident_manager", module_slug="it-service-desk",
        detail={"severidad_anterior": old_severity_id, "severidad_nueva": severity_id},
    ))
    await db.commit()
    return {"success": True, "message": "Severidad validada"}


# ------------------------------------------------------------------
# Dashboard de metricas -- Incident Manager, Project Manager y Comite
# Directivo ven todo; los especialistas solo ven lo de su propio equipo.
# Jefe Empresa, Auditoria y solicitantes no tienen acceso a este endpoint.
# ------------------------------------------------------------------

DASHBOARD_FULL_ACCESS_ROLES = {
    "it-service-desk:incident-manager", "it-service-desk:project-manager",
    "it-service-desk:comite-directivo",
}


@router.get("/estadisticas")
async def get_dashboard_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    roles = set(user.get("roles") or [])
    has_full_access = bool(roles & DASHBOARD_FULL_ACCESS_ROLES) or "super_admin" in roles
    is_especialista_funcional = "it-service-desk:especialista-funcional" in roles
    is_especialista_tecnico = "it-service-desk:especialista-tecnico" in roles

    if not has_full_access and not is_especialista_funcional and not is_especialista_tecnico:
        raise HTTPException(status_code=403, detail="No tienes acceso al dashboard de metricas")

    # El frontend manda fechas en calendario local (hora de Ciudad de
    # Mexico, UTC-6, sin horario de verano desde 2022), pero la BD guarda
    # todo en UTC. Sin este ajuste, un ticket creado a las 7pm hora local
    # queda guardado como la 1am UTC del dia siguiente y se le "escapa"
    # al filtro de fecha aunque el usuario lo vea como "hoy".
    MEXICO_UTC_OFFSET = timedelta(hours=6)
    now = datetime.now(timezone.utc)
    if date_to:
        end_local = datetime.fromisoformat(date_to)
        # Si solo se manda la fecha (sin hora), se interpreta como el
        # final de ese dia en hora local (23:59:59), no en UTC.
        if end_local.hour == 0 and end_local.minute == 0 and end_local.second == 0:
            end_local = end_local.replace(hour=23, minute=59, second=59, microsecond=999999)
        end = (end_local + MEXICO_UTC_OFFSET).replace(tzinfo=timezone.utc)
    else:
        end = now
    if date_from:
        start_local = datetime.fromisoformat(date_from)
        start = (start_local + MEXICO_UTC_OFFSET).replace(tzinfo=timezone.utc)
    else:
        start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    query = select(Incident).where(Incident.created_at >= start, Incident.created_at <= end)

    scope = "completo"
    my_team = None
    if not has_full_access:
        my_team = "especialista-funcional" if is_especialista_funcional else "especialista-tecnico"
        query = query.where(Incident.assigned_team == my_team)
        scope = my_team

    result = await db.execute(query)
    incidents = result.scalars().all()

    def is_open(i):
        return i.status not in ("resuelto", "cerrado")

    def is_overdue(i):
        return bool(i.sla_resolution_limit and i.sla_resolution_limit < now)

    REPORTED_TYPE_TO_TEAM = {"funcional": "especialista-funcional", "tecnico": "especialista-tecnico"}

    def equipo_de(i):
        """Un ticket en backlog no tiene assigned_team todavia -- se usa
        el tipo que reporto el solicitante como equipo "destino" para
        poder contarlo dentro de su especialidad correspondiente."""
        return i.assigned_team or REPORTED_TYPE_TO_TEAM.get(i.reported_type)

    def categoria(i):
        """En backlog es su propia categoria, sin importar si ya vencio
        su SLA -- distingue "nunca se atendio" de "se atendio tarde".
        Por vencer: aun no vence, pero faltan 2 horas o menos."""
        if i.status == "en_backlog":
            return "en_backlog"
        if is_overdue(i):
            return "vencido"
        if i.sla_resolution_limit and (i.sla_resolution_limit - now) <= timedelta(hours=2):
            return "por_vencer"
        return "a_tiempo"

    total_completados = sum(1 for i in incidents if not is_open(i))

    open_incidents = [i for i in incidents if is_open(i)]
    sla_general = {
        "a_tiempo": sum(1 for i in open_incidents if categoria(i) == "a_tiempo"),
        "vencido": sum(1 for i in open_incidents if categoria(i) == "vencido"),
        "en_backlog": sum(1 for i in open_incidents if categoria(i) == "en_backlog"),
        "por_vencer": sum(1 for i in open_incidents if categoria(i) == "por_vencer"),
    }

    por_especialidad = None
    sla_tecnico = None
    sla_funcional = None
    por_usuario = None
    if has_full_access:
        por_especialidad = {
            "funcional": sum(1 for i in incidents if equipo_de(i) == "especialista-funcional"),
            "tecnico": sum(1 for i in incidents if equipo_de(i) == "especialista-tecnico"),
        }
        # Backlog no se atribuye a ningun equipo aqui -- un ticket sin
        # asignar es responsabilidad del Incident Manager (el motor no
        # encontro a quien turnarselo), no una falla del equipo tecnico
        # o funcional que nunca llego a verlo. Por eso estas dos vistas
        # solo consideran tickets que SI tienen assigned_team real.
        tecnico_open = [i for i in open_incidents if i.assigned_team == "especialista-tecnico"]
        sla_tecnico = {
            "a_tiempo": sum(1 for i in tecnico_open if categoria(i) == "a_tiempo"),
            "vencido": sum(1 for i in tecnico_open if categoria(i) == "vencido"),
            "por_vencer": sum(1 for i in tecnico_open if categoria(i) == "por_vencer"),
        }
        funcional_open = [i for i in open_incidents if i.assigned_team == "especialista-funcional"]
        sla_funcional = {
            "a_tiempo": sum(1 for i in funcional_open if categoria(i) == "a_tiempo"),
            "vencido": sum(1 for i in funcional_open if categoria(i) == "vencido"),
            "por_vencer": sum(1 for i in funcional_open if categoria(i) == "por_vencer"),
        }

        # Por persona -- solo tickets abiertos, con desglose de a_tiempo/vencido
        # (los completados no tienen "estado de SLA" vigente que reportar aqui)
        conteo_por_usuario: Dict[str, Dict[str, int]] = {}
        for i in open_incidents:
            if not i.assigned_to_user_id:
                continue
            if i.assigned_to_user_id not in conteo_por_usuario:
                conteo_por_usuario[i.assigned_to_user_id] = {"a_tiempo": 0, "vencido": 0}
            if is_overdue(i):
                conteo_por_usuario[i.assigned_to_user_id]["vencido"] += 1
            else:
                conteo_por_usuario[i.assigned_to_user_id]["a_tiempo"] += 1

        nombres_cache: Dict[str, str] = {}
        for uid in conteo_por_usuario:
            perfil = await _get_requester_profile(uid)
            nombres_cache[uid] = perfil.get("full_name") or "Desconocido"

        por_usuario = sorted(
            [
                {"nombre": nombres_cache[uid], "a_tiempo": v["a_tiempo"], "vencido": v["vencido"], "total": v["a_tiempo"] + v["vencido"]}
                for uid, v in conteo_por_usuario.items()
            ],
            key=lambda x: -x["total"],
        )

    histograma_map: Dict[str, int] = {}
    cursor = start
    while cursor.date() <= end.date():
        histograma_map[cursor.date().isoformat()] = 0
        cursor += timedelta(days=1)
    for i in incidents:
        key = i.created_at.date().isoformat()
        if key in histograma_map:
            histograma_map[key] += 1
    histograma = [{"fecha": k, "cantidad": v} for k, v in sorted(histograma_map.items())]

    return {
        "scope": scope,
        "rango": {"desde": start.isoformat(), "hasta": end.isoformat()},
        "total_completados_periodo": total_completados,
        "sla_general": sla_general,
        "por_especialidad": por_especialidad,
        "sla_tecnico": sla_tecnico,
        "sla_funcional": sla_funcional,
        "histograma": histograma,
        "por_usuario": por_usuario,
    }


# ------------------------------------------------------------------
# Exportar concentrado completo a Excel
# ------------------------------------------------------------------

@router.get("/reportes/incidencias-excel")
async def export_incidents_excel(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    roles = set(user.get("roles") or [])
    has_full_access = bool(roles & DASHBOARD_FULL_ACCESS_ROLES) or "super_admin" in roles
    if not has_full_access:
        raise HTTPException(status_code=403, detail="No tienes permiso para exportar el concentrado")

    result = await db.execute(select(Incident).order_by(Incident.created_at))
    incidents = result.scalars().all()

    sev_result = await db.execute(select(TicketSeverity))
    severities = {s.id: s for s in sev_result.scalars().all()}
    sys_result = await db.execute(select(TicketSystem))
    systems = {s.id: s for s in sys_result.scalars().all()}
    mod_result = await db.execute(select(TicketModule))
    modules = {m.id: m for m in mod_result.scalars().all()}

    now = datetime.now(timezone.utc)

    perfil_cache: Dict[str, Dict[str, Any]] = {}
    async def perfil(uid: Optional[str]) -> Dict[str, Any]:
        if not uid:
            return {}
        if uid not in perfil_cache:
            perfil_cache[uid] = await _get_requester_profile(uid)
        return perfil_cache[uid]

    filas = []
    for i in incidents:
        sev = severities.get(i.severity_validated_id or i.severity_reported_id)
        sistema = systems.get(i.system_id)
        modulo = modules.get(i.module_id) if i.module_id else None
        requester_profile = await perfil(i.requester_id)
        assignee_profile = await perfil(i.assigned_to_user_id)

        es_final = i.status in ("resuelto", "cerrado")
        vencido = bool(i.sla_resolution_limit and not es_final and i.sla_resolution_limit < now)
        cumplio_final = bool(i.resolved_at and i.sla_resolution_limit and i.resolved_at <= i.sla_resolution_limit)

        dias_transcurridos = ((i.resolved_at or now) - i.created_at).days
        dias_vencido = (now - i.sla_resolution_limit).days if vencido and i.sla_resolution_limit else 0

        equipo = "Backlog" if i.status == "en_backlog" else (
            "Funcional" if i.assigned_team == "especialista-funcional" else
            "Tecnico" if i.assigned_team == "especialista-tecnico" else (i.assigned_team or "")
        )

        # Cumplimiento SLA 1 (respuesta -- se usa la asignacion como primer contacto)
        if i.assigned_at and i.sla_response_limit:
            delta1 = (i.assigned_at - i.created_at).total_seconds() / 60
            sla1_horas = f"{delta1/60:.1f} h"
            sla1_estado = "Cumplido" if i.assigned_at <= i.sla_response_limit else "Incumplido"
        else:
            sla1_horas = ""
            sla1_estado = "Pendiente"

        # Cumplimiento SLA 2 (resolucion)
        if i.resolved_at and i.sla_resolution_limit:
            delta2 = (i.resolved_at - i.created_at).total_seconds() / 60
            sla2_horas = f"{delta2/60:.1f} h"
            sla2_estado = "Cumplido" if cumplio_final else "Incumplido"
        else:
            sla2_horas = ""
            sla2_estado = "Pendiente" if not es_final else "N/A"

        # Horas en el estatus actual (desde el ultimo evento de bitacora, o desde creacion)
        log_result = await db.execute(
            select(IncidentActivityLog)
            .where(IncidentActivityLog.incident_id == i.id)
            .order_by(IncidentActivityLog.performed_at.desc())
            .limit(1)
        )
        ultimo_evento = log_result.scalar_one_or_none()
        referencia = ultimo_evento.performed_at if ultimo_evento else i.created_at
        horas_estatus = round((now - referencia).total_seconds() / 3600, 1)

        filas.append({
            "Folio": i.folio,
            "Familia": requester_profile.get("family_clave", ""),
            "Empresa": i.requester_company_name,
            "Creado por": i.requester_name,
            "Fecha de creación": i.created_at.replace(tzinfo=None) if i.created_at else None,
            "Nivel crítico": f"{sev.code} - {sev.name}" if sev else "",
            "Sistema": sistema.name if sistema else "",
            "Módulo": modulo.name if modulo else "",
            "Estatus": STATUS_LABEL_ES.get(i.status, i.status),
            "Con quién está (equipo)": equipo,
            "Asignado a": assignee_profile.get("full_name", "") if i.assigned_to_user_id else "",
            "Fecha inicial SLA": i.created_at.replace(tzinfo=None) if i.created_at else None,
            "Fecha final SLA (resolución)": i.sla_resolution_limit.replace(tzinfo=None) if i.sla_resolution_limit else None,
            "Horas en estatus actual": horas_estatus,
            "A tiempo / Vencido": "En backlog" if i.status == "en_backlog" else ("Vencido" if vencido else "A tiempo") if not es_final else ("Cumplió SLA" if cumplio_final else "Se venció"),
            "Días transcurridos": dias_transcurridos,
            "Días vencido": dias_vencido,
            "Cumplimiento SLA 1 (respuesta)": sla1_estado,
            "Tiempo real SLA 1": sla1_horas,
            "Cumplimiento SLA 2 (resolución)": sla2_estado,
            "Tiempo real SLA 2": sla2_horas,
        })

    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from fastapi.responses import StreamingResponse

    wb = Workbook()
    ws = wb.active
    ws.title = "Concentrado de Incidencias"

    headers = list(filas[0].keys()) if filas else []
    ws.append(headers)
    header_fill = PatternFill(start_color="7C2D12", end_color="7C2D12", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    for col_idx, _ in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for fila in filas:
        ws.append(list(fila.values()))

    for col_idx, header in enumerate(headers, start=1):
        max_len = max([len(str(header))] + [len(str(f.get(header, ""))) for f in filas]) if filas else len(header)
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 3, 40)

    ws.freeze_panes = "A2"

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"concentrado_incidencias_{now.strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


STATUS_LABEL_ES = {
    "en_backlog": "En backlog", "asignado": "Asignado", "en_atencion": "En atención",
    "escalado": "Escalado", "resuelto": "Resuelto", "cerrado": "Cerrado",
}


# ------------------------------------------------------------------
# Reporte diario de SLA -- vencidos y por vencer, por rol.
# Interno (sin JWT) -- lo dispara el cron de infrastructure/cron/,
# no un usuario desde el navegador. Usa el HTML propio del reporte
# (no se envuelve en base.html, ver /api/v1/email/raw-html).
# ------------------------------------------------------------------

@router.post("/internal/reportes/sla-diario", include_in_schema=False)
async def send_daily_sla_report_internal(db: AsyncSession = Depends(get_db)):
    from app.cron.templates.sla_report_template import build_sla_report_html

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Incident).where(Incident.status.notin_(["resuelto", "cerrado"]))
    )
    incidents = result.scalars().all()

    def categoria(i):
        if not i.sla_resolution_limit:
            return None
        if i.sla_resolution_limit < now:
            return "vencido"
        if (i.sla_resolution_limit - now) <= timedelta(hours=2):
            return "por_vencer"
        return None

    relevantes = [(i, categoria(i)) for i in incidents]
    relevantes = [(i, c) for i, c in relevantes if c is not None]

    # Cache de nombres de quien tiene cada ticket -- para la columna "Asignado a"
    nombres_cache: Dict[str, str] = {}
    async def nombre_de(user_id: Optional[str]) -> str:
        if not user_id:
            return "Sin asignar"
        if user_id not in nombres_cache:
            perfil = await _get_requester_profile(user_id)
            nombres_cache[user_id] = perfil.get("full_name") or "Desconocido"
        return nombres_cache[user_id]

    async def build_ticket_dicts(items: list) -> list:
        salida = []
        for i, c in sorted(items, key=lambda x: x[0].sla_resolution_limit):
            delta_h = abs((i.sla_resolution_limit - now).total_seconds()) / 3600
            sev = i.severity_validated_id or i.severity_reported_id
            sev_result = await db.execute(select(TicketSeverity).where(TicketSeverity.id == sev))
            sev_obj = sev_result.scalar_one_or_none()
            salida.append({
                "folio": i.folio,
                "title": i.title,
                "assigned_name": await nombre_de(i.assigned_to_user_id),
                "sev_code": sev_obj.code if sev_obj else "S4",
                "hours_text": f"{delta_h:.1f} h",
                "hours_color": "#dc2626" if c == "vencido" else "#c2410c",
            })
        return salida

    import httpx
    import base64
    from app.cron.chart_generator import generar_histograma_volumen

    hoy = now.date()
    volumen_map: Dict[str, int] = {(hoy - timedelta(days=d)).isoformat(): 0 for d in range(6, -1, -1)}
    result_7d = await db.execute(
        select(Incident.created_at).where(Incident.created_at >= now - timedelta(days=7))
    )
    for (creado,) in result_7d.all():
        key = creado.date().isoformat()
        if key in volumen_map:
            volumen_map[key] += 1
    datos_histograma = [{"fecha": k, "cantidad": v} for k, v in sorted(volumen_map.items())]
    histograma_png = generar_histograma_volumen(datos_histograma)
    histograma_b64 = base64.b64encode(histograma_png).decode("ascii")
    HISTOGRAMA_CID = "histograma_volumen"

    enviados = []
    fecha_texto = now.strftime("%A %d de %B de %Y, %I:%M %p")

    async def enviar_a(user_id: str, items: list):
        if not items:
            return
        profile = await _get_requester_profile(user_id)
        if not profile.get("email"):
            return
        vencidos_items = [(i, c) for i, c in items if c == "vencido"]
        por_vencer_items = [(i, c) for i, c in items if c == "por_vencer"]
        html = build_sla_report_html(
            full_name=profile.get("full_name", ""),
            fecha_texto=fecha_texto,
            vencidos=await build_ticket_dicts(vencidos_items),
            por_vencer=await build_ticket_dicts(por_vencer_items),
            frontend_url=config.FRONTEND_URL,
            histograma_cid=HISTOGRAMA_CID,
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    "http://email-service:8000/api/v1/email/raw-html",
                    json={
                        "to_email": profile["email"],
                        "full_name": profile.get("full_name", ""),
                        "subject": f"Solicitudes de tickets vencidos — {len(vencidos_items)} vencido(s), {len(por_vencer_items)} por vencer",
                        "html_content": html,
                        "inline_images": [{"content_id": HISTOGRAMA_CID, "data_base64": histograma_b64, "subtype": "png"}],
                    },
                )
            enviados.append(profile["email"])
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=5.0) as client:
        im_resp = await client.get(
            "http://admin-service:8000/internal/users/by-module-role",
            params={"module_slug": "it-service-desk", "role_slug": "incident-manager"},
        )
        pm_resp = await client.get(
            "http://admin-service:8000/internal/users/by-module-role",
            params={"module_slug": "it-service-desk", "role_slug": "project-manager"},
        )
        comite_resp = await client.get(
            "http://admin-service:8000/internal/users/by-module-role",
            params={"module_slug": "it-service-desk", "role_slug": "comite-directivo"},
        )
        func_resp = await client.get(
            "http://admin-service:8000/internal/users/by-module-role",
            params={"module_slug": "it-service-desk", "role_slug": "especialista-funcional"},
        )
        tec_resp = await client.get(
            "http://admin-service:8000/internal/users/by-module-role",
            params={"module_slug": "it-service-desk", "role_slug": "especialista-tecnico"},
        )

    full_access_users = []
    for resp in (im_resp, pm_resp, comite_resp):
        if resp.status_code == 200:
            full_access_users.extend(resp.json())
    funcional_users = func_resp.json() if func_resp.status_code == 200 else []
    tecnico_users = tec_resp.json() if tec_resp.status_code == 200 else []

    funcional_items = [(i, c) for i, c in relevantes if i.assigned_team == "especialista-funcional"]
    tecnico_items = [(i, c) for i, c in relevantes if i.assigned_team == "especialista-tecnico"]

    seen_full_access = set()
    for u in full_access_users:
        if u["id"] not in seen_full_access:
            seen_full_access.add(u["id"])
            await enviar_a(u["id"], relevantes)

    seen_func = set()
    for u in funcional_users:
        if u["id"] not in seen_func:
            seen_func.add(u["id"])
            await enviar_a(u["id"], funcional_items)

    seen_tec = set()
    for u in tecnico_users:
        if u["id"] not in seen_tec:
            seen_tec.add(u["id"])
            await enviar_a(u["id"], tecnico_items)

    return {
        "success": True,
        "total_vencidos": sum(1 for _, c in relevantes if c == "vencido"),
        "total_por_vencer": sum(1 for _, c in relevantes if c == "por_vencer"),
        "correos_enviados": enviados,
    }
