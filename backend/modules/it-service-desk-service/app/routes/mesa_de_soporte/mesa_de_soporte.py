import re
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.database import get_db
from app.models.mesa_de_soporte import (
    Incident, TicketSeverity, TicketSystem, TicketModule, FolioCounter,
)
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/mesa-de-soporte", tags=["Mesa De Soporte"])

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()


@router.get("/")
async def list_mesa_de_soporte():
    return {"data": [], "message": "Listado de Mesa De Soporte"}


# ------------------------------------------------------------------
# Schema de entrada -- los 7 campos que llena el solicitante
# ------------------------------------------------------------------

class CreateIncidentRequest(BaseModel):
    title: str
    system_id: str
    module_id: Optional[str] = None
    reported_type: Optional[str] = None
    severity_reported_id: str
    description: str


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
    body: CreateIncidentRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = user.get("user_id")
    company_id = user.get("companies", [None])[0] if user.get("companies") else None
    if not company_id:
        raise HTTPException(status_code=400, detail="El usuario no tiene empresa asignada")

    profile = await _get_requester_profile(user_id)

    severity_result = await db.execute(select(TicketSeverity).where(TicketSeverity.id == body.severity_reported_id))
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
        title=body.title,
        company_id=company_id,
        requester_id=user_id,
        requester_name=profile.get("full_name"),
        requester_phone=profile.get("phone"),
        requester_puesto=profile.get("puesto"),
        requester_area=profile.get("departamento"),
        requester_company_name=profile.get("company_name"),
        system_id=body.system_id,
        module_id=body.module_id,
        reported_type=body.reported_type,
        description=body.description,
        severity_reported_id=body.severity_reported_id,
        sla_response_limit=sla_response_limit,
        sla_resolution_limit=sla_resolution_limit,
        status="en_backlog",
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)

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
        },
    }
