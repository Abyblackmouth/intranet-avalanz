import re
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.database import get_db
from app.models.mesa_de_soporte import (
    Incident, TicketSeverity, TicketSystem, TicketModule, FolioCounter,
    IncidentAttachment,
)
from shared.middleware.jwt_validator import JWTValidator, get_token_from_request

router = APIRouter(prefix="/mesa-de-soporte", tags=["Mesa De Soporte"])

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()


@router.get("/")
async def list_mesa_de_soporte():
    return {"data": [], "message": "Listado de Mesa De Soporte"}


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

    now = datetime.utcnow()
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
                uploaded_at=datetime.utcnow(),
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
