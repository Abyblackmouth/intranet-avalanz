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
    "funcional": "equipo-funcional",
    "tecnico": "equipo-tecnico",
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
