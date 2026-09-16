import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.database import get_db
from app.models.mesa_de_soporte import TicketSystem, TicketModule, SystemSpecialist
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/actualizaciones", tags=["Actualizaciones"])

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()

ALLOWED_ROLE = "it-service-desk:incident-manager"


def _require_incident_manager(user: dict) -> None:
    if ALLOWED_ROLE not in (user.get("roles") or []) and "super_admin" not in (user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Solo Incident Manager puede administrar este catalogo")


@router.get("/")
async def list_actualizaciones():
    return {"data": [], "message": "Listado de Actualizaciones"}


# ------------------------------------------------------------------
# Sistemas
# ------------------------------------------------------------------

class SystemRequest(BaseModel):
    name: str
    is_active: Optional[bool] = True


@router.get("/sistemas")
async def list_systems(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    result = await db.execute(select(TicketSystem).order_by(TicketSystem.name))
    return {"data": [
        {"id": s.id, "name": s.name, "is_active": s.is_active} for s in result.scalars().all()
    ]}


@router.post("/sistemas")
async def create_system(body: SystemRequest, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    system = TicketSystem(name=body.name, is_active=body.is_active)
    db.add(system)
    await db.commit()
    await db.refresh(system)
    return {"success": True, "data": {"id": system.id, "name": system.name, "is_active": system.is_active}}


@router.patch("/sistemas/{system_id}")
async def update_system(system_id: str, body: SystemRequest, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    result = await db.execute(select(TicketSystem).where(TicketSystem.id == system_id))
    system = result.scalar_one_or_none()
    if not system:
        raise HTTPException(status_code=404, detail="Sistema no encontrado")
    system.name = body.name
    system.is_active = body.is_active
    system.updated_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "message": "Sistema actualizado"}


# ------------------------------------------------------------------
# Modulos (de sistema)
# ------------------------------------------------------------------

class ModuleRequest(BaseModel):
    system_id: str
    name: str
    is_active: Optional[bool] = True


@router.get("/modulos")
async def list_modules(system_id: Optional[str] = None, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(TicketModule).order_by(TicketModule.name)
    if system_id:
        query = query.where(TicketModule.system_id == system_id)
    result = await db.execute(query)
    return {"data": [
        {"id": m.id, "system_id": m.system_id, "name": m.name, "is_active": m.is_active} for m in result.scalars().all()
    ]}


@router.post("/modulos")
async def create_module(body: ModuleRequest, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    module = TicketModule(system_id=body.system_id, name=body.name, is_active=body.is_active)
    db.add(module)
    await db.commit()
    await db.refresh(module)
    return {"success": True, "data": {"id": module.id, "name": module.name}}


@router.patch("/modulos/{module_id}")
async def update_module(module_id: str, body: ModuleRequest, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    result = await db.execute(select(TicketModule).where(TicketModule.id == module_id))
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Modulo no encontrado")
    module.name = body.name
    module.system_id = body.system_id
    module.is_active = body.is_active
    module.updated_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "message": "Modulo actualizado"}


# ------------------------------------------------------------------
# Especialistas (enlace del motor de asignacion)
# ------------------------------------------------------------------

class SpecialistRequest(BaseModel):
    system_id: Optional[str] = None
    module_id: Optional[str] = None
    team_type: str  # especialista-funcional | especialista-tecnico
    specialist_user_id: str
    is_active: Optional[bool] = True


@router.get("/especialistas")
async def list_specialists(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    import httpx
    result = await db.execute(select(SystemSpecialist))
    specialists = result.scalars().all()

    # Enriquecer con el nombre real -- sin esto, el front tendria que hacer
    # una llamada aparte por cada fila solo para saber quien es la persona.
    names_cache: dict = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        for s in specialists:
            if s.specialist_user_id not in names_cache:
                try:
                    resp = await client.get(f"http://admin-service:8000/internal/users/{s.specialist_user_id}/profile")
                    names_cache[s.specialist_user_id] = resp.json().get("full_name") if resp.status_code == 200 else None
                except Exception:
                    names_cache[s.specialist_user_id] = None

    return {"data": [
        {
            "id": s.id, "system_id": s.system_id, "module_id": s.module_id,
            "team_type": s.team_type, "specialist_user_id": s.specialist_user_id,
            "specialist_user_name": names_cache.get(s.specialist_user_id),
            "is_active": s.is_active,
        } for s in specialists
    ]}


@router.post("/especialistas")
async def create_specialist(body: SpecialistRequest, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)

    is_catchall = body.system_id is None and body.module_id is None
    role_slug = body.team_type  # especialista-funcional | especialista-tecnico

    async def _users_with_role(slug: str):
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "http://admin-service:8000/internal/users/by-module-role",
                params={"module_slug": "it-service-desk", "role_slug": slug},
            )
            return [u["id"] for u in resp.json()] if resp.status_code == 200 else []

    im_users = await _users_with_role("incident-manager")
    if body.specialist_user_id in im_users:
        pass  # Incident Manager ya tiene autoridad total (roles-mesa-ayuda.md)
    elif is_catchall:
        # El catch-all (system_id/module_id en blanco) exige el rol de
        # confianza -- Especialista Funcional o Tecnico, segun el equipo.
        valid_users = await _users_with_role(role_slug)
        if body.specialist_user_id not in valid_users:
            raise HTTPException(
                status_code=400,
                detail=f"Para ser especialista general (catch-all) se requiere el rol '{role_slug}'",
            )
    else:
        # Anclaje a un segmento especifico (sistema/modulo puntual) --
        # acepta el rol "Tecnico" (generico, para cualquiera de los dos
        # ramos) o directamente el rol Especialista correspondiente.
        tecnico_users = await _users_with_role("tecnico")
        especialista_users = await _users_with_role(role_slug)
        if body.specialist_user_id not in tecnico_users and body.specialist_user_id not in especialista_users:
            raise HTTPException(
                status_code=400,
                detail=f"Para un anclaje especifico se requiere el rol 'Tecnico' o '{role_slug}'",
            )

    specialist = SystemSpecialist(
        system_id=body.system_id, module_id=body.module_id, team_type=body.team_type,
        specialist_user_id=body.specialist_user_id, is_active=body.is_active,
    )
    db.add(specialist)
    await db.commit()
    await db.refresh(specialist)
    return {"success": True, "data": {"id": specialist.id}}


@router.patch("/especialistas/{specialist_id}")
async def update_specialist(specialist_id: str, body: SpecialistRequest, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    _require_incident_manager(user)
    result = await db.execute(select(SystemSpecialist).where(SystemSpecialist.id == specialist_id))
    specialist = result.scalar_one_or_none()
    if not specialist:
        raise HTTPException(status_code=404, detail="Especialista no encontrado")
    specialist.system_id = body.system_id
    specialist.module_id = body.module_id
    specialist.team_type = body.team_type
    specialist.specialist_user_id = body.specialist_user_id
    specialist.is_active = body.is_active
    specialist.updated_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "message": "Especialista actualizado"}
