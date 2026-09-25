"""Motor de asignacion automatica -- funcion cerrada.

Entrada/salida fijas segun submodulo-incidencias-motor-asignacion.md
seccion 3. La logica interna (busqueda en 3 pasos contra
system_specialists) es reemplazable por un modelo predictivo mas
adelante, sin cambiar el contrato de entrada/salida.
"""
from typing import Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mesa_de_soporte import SystemSpecialist

# UUID fijo que representa al sistema/motor como actor en la bitacora --
# nunca representa a una persona real.
SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000"

TEAM_BY_REPORTED_TYPE = {
    "funcional": "especialista-funcional",
    "tecnico": "especialista-tecnico",
}


async def resolve_assignment(
    db: AsyncSession,
    system_id: str,
    module_id: Optional[str],
    reported_type: Optional[str],
) -> Dict[str, Any]:
    """Busca en system_specialists, en orden: por modulo exacto -> por
    sistema completo -> por especialista general del equipo. Se detiene
    en el primer resultado. Salida: {encontrado, equipo_asignado,
    usuario_asignado}."""

    team_type = TEAM_BY_REPORTED_TYPE.get(reported_type)

    async def _buscar(system_filter, module_filter):
        conditions = [
            SystemSpecialist.is_active == True,
            SystemSpecialist.system_id == system_filter if system_filter is not None
                else SystemSpecialist.system_id.is_(None),
            SystemSpecialist.module_id == module_filter if module_filter is not None
                else SystemSpecialist.module_id.is_(None),
        ]
        if team_type:
            conditions.append(SystemSpecialist.team_type == team_type)
        result = await db.execute(select(SystemSpecialist).where(*conditions))
        return result.scalars().first()

    # Paso 1: por modulo exacto (el mas especifico)
    if module_id:
        specialist = await _buscar(system_id, module_id)
        if specialist:
            return {
                "encontrado": True,
                "equipo_asignado": specialist.team_type,
                "usuario_asignado": specialist.specialist_user_id,
            }

    # Paso 2: por sistema completo
    specialist = await _buscar(system_id, None)
    if specialist:
        return {
            "encontrado": True,
            "equipo_asignado": specialist.team_type,
            "usuario_asignado": specialist.specialist_user_id,
        }

    # Paso 3: especialista general del equipo (catch-all)
    specialist = await _buscar(None, None)
    if specialist:
        return {
            "encontrado": True,
            "equipo_asignado": specialist.team_type,
            "usuario_asignado": specialist.specialist_user_id,
        }

    return {"encontrado": False, "equipo_asignado": None, "usuario_asignado": None}


async def resolve_cdc_assignment(db: AsyncSession, system_id: Optional[str], module_id: Optional[str]) -> Dict[str, Any]:
    """Resuelve a quien asignar un Control de Cambios al salir de backlog.
    Logica propia de CDC, separada de resolve_assignment (que es exclusiva
    de Incidente) -- no comparten codigo a proposito, aunque la forma se
    parezca (busqueda en pasos, deteniendose en el primero que aplique).

    Prioridad, confirmada explicitamente con el dueno del proyecto:
    1. Incident Manager ligado especificamente a este sistema/modulo
       (configurado en Actualizaciones -> Especialistas, team_type='incident-manager')
    2. Project Manager real (tiene el rol de modulo), no bloqueado ni dado de baja
    3. Incident Manager activado con el boton general (team_type='project-manager',
       system_id y module_id ambos NULL) -- solo si no hubo paso 2
    4. Nada de lo anterior -> se queda sin asignar en backlog
    """
    import httpx

    # Paso 1 -- Incident Manager ligado a este sistema/modulo especifico
    if module_id:
        result = await db.execute(select(SystemSpecialist).where(
            SystemSpecialist.is_active == True,
            SystemSpecialist.team_type == "incident-manager",
            SystemSpecialist.system_id == system_id,
            SystemSpecialist.module_id == module_id,
        ))
        specialist = result.scalars().first()
        if specialist:
            return {"encontrado": True, "usuario_asignado": specialist.specialist_user_id, "via": "incident_manager_ligado"}

    if system_id:
        result = await db.execute(select(SystemSpecialist).where(
            SystemSpecialist.is_active == True,
            SystemSpecialist.team_type == "incident-manager",
            SystemSpecialist.system_id == system_id,
            SystemSpecialist.module_id.is_(None),
        ))
        specialist = result.scalars().first()
        if specialist:
            return {"encontrado": True, "usuario_asignado": specialist.specialist_user_id, "via": "incident_manager_ligado"}

    # Paso 2 -- Project Manager real. El endpoint ya filtra is_active y
    # is_locked (usuarios dados de baja o bloqueados quedan fuera solos).
    project_managers = []
    incident_managers_activos = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            pm_resp = await client.get(
                "http://admin-service:8000/internal/users/by-module-role",
                params={"module_slug": "it-service-desk", "role_slug": "project-manager"},
            )
            project_managers = pm_resp.json() if pm_resp.status_code == 200 else []

            im_resp = await client.get(
                "http://admin-service:8000/internal/users/by-module-role",
                params={"module_slug": "it-service-desk", "role_slug": "incident-manager"},
            )
            incident_managers_activos = im_resp.json() if im_resp.status_code == 200 else []
    except Exception:
        pass

    if project_managers:
        return {"encontrado": True, "usuario_asignado": project_managers[0]["id"], "via": "project_manager_real"}

    # Paso 3 -- Incident Manager activado con el boton general, pero solo
    # si ese usuario sigue activo y sin bloquear (cruzado contra la lista
    # de Incident Managers ya filtrada arriba -- evita asignar a alguien
    # que se activo el boton y despues fue bloqueado o dado de baja).
    result = await db.execute(select(SystemSpecialist).where(
        SystemSpecialist.is_active == True,
        SystemSpecialist.team_type == "project-manager",
        SystemSpecialist.system_id.is_(None),
        SystemSpecialist.module_id.is_(None),
    ))
    fallback = result.scalars().first()
    if fallback:
        ids_activos = {im["id"] for im in incident_managers_activos}
        if fallback.specialist_user_id in ids_activos:
            return {"encontrado": True, "usuario_asignado": fallback.specialist_user_id, "via": "incident_manager_activado"}

    return {"encontrado": False}
