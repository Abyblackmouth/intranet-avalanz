"""Usuarios de plataformas (Ajustes → Usuarios): id de usuario de la plataforma ↔ usuario de la Intranet.

El motor liga solo a quien llega en un sobre con correo; aqui se ven los
pendientes, se ligan a mano y se capturan los ids de los aprobadores para
que el resultado regrese a Protheus con su codigo de usuario.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.models import Conexion, ConexionUsuario
from app.services.ajustes.ajustes_service import registrar_historial


def serializar(u: ConexionUsuario) -> Dict[str, Any]:
    return {"id": u.id, "conexion_id": u.conexion_id, "id_externo": u.id_externo, "login_externo": u.login_externo,
            "email": u.email, "nombre": u.nombre, "user_id": u.user_id, "ligado": bool(u.user_id),
            "ultima_vez": u.ultima_vez.isoformat() if u.ultima_vez else None}


async def listar(db: AsyncSession, conexion_id: Optional[str], solo_pendientes: bool, q: str) -> List[Dict[str, Any]]:
    stmt = select(ConexionUsuario)
    if conexion_id:
        stmt = stmt.where(ConexionUsuario.conexion_id == conexion_id)
    if solo_pendientes:
        stmt = stmt.where(ConexionUsuario.user_id.is_(None))
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where((ConexionUsuario.nombre.ilike(like)) | (ConexionUsuario.email.ilike(like))
                          | (ConexionUsuario.id_externo.ilike(like)) | (ConexionUsuario.login_externo.ilike(like)))
    res = await db.execute(stmt.order_by(ConexionUsuario.user_id.is_(None).desc(), ConexionUsuario.nombre))
    return [serializar(u) for u in res.scalars().all()]


async def buscar_intranet(q: str) -> List[Dict[str, Any]]:
    """Usuarios activos de la Intranet por nombre o correo (admin-service, red interna)."""
    if len(q.strip()) < 2:
        return []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{config.ADMIN_SERVICE_URL}/internal/users/search", params={"q": q.strip(), "limit": 15})
        return r.json() if r.status_code == 200 else []
    except Exception:
        return []


async def _conexion(db: AsyncSession, conexion_id: str) -> Conexion:
    res = await db.execute(select(Conexion).where(Conexion.id == conexion_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    return c


async def guardar(db: AsyncSession, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    """Crea o actualiza la liga (conexion_id + id_externo es unico)."""
    c = await _conexion(db, datos.get("conexion_id", ""))
    id_externo = (datos.get("id_externo") or "").strip()
    if not id_externo:
        raise HTTPException(status_code=422, detail="El id en la plataforma es obligatorio")
    res = await db.execute(select(ConexionUsuario).where(ConexionUsuario.conexion_id == c.id, ConexionUsuario.id_externo == id_externo))
    u = res.scalar_one_or_none()
    if u is None:
        u = ConexionUsuario(conexion_id=c.id, id_externo=id_externo)
        db.add(u)
    # Si vienen datos del usuario de la Intranet, se toman como nombre/correo por defecto
    for campo in ("login_externo", "email", "nombre"):
        if datos.get(campo) is not None:
            setattr(u, campo, (datos.get(campo) or "").strip() or None if campo != "nombre" else (datos.get(campo) or "").strip())
    if "user_id" in datos:
        u.user_id = datos.get("user_id") or None
    u.updated_at = datetime.now(timezone.utc)
    await registrar_historial(db, f"usuario.{c.slug}", None, f"{id_externo} ↔ {u.nombre or u.email or '—'}{'' if u.user_id else ' (sin ligar)'}", user)
    await db.commit()
    await db.refresh(u)
    return serializar(u)


async def quitar(db: AsyncSession, usuario_id: str, user: Dict[str, Any]) -> None:
    res = await db.execute(select(ConexionUsuario).where(ConexionUsuario.id == usuario_id))
    u = res.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    c = await _conexion(db, u.conexion_id)
    await registrar_historial(db, f"usuario.{c.slug}", None, f"quitado: {u.id_externo} ({u.nombre})", user)
    await db.delete(u)
    await db.commit()
