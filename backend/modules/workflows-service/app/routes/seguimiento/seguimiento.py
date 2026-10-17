"""Seguimiento: todos los trámites (según scope), transacciones con las plataformas y acciones de administración."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import Instancia, Transaccion
from app.motor import consultas
from app.motor import instancias as motor
from app.motor import transacciones as outbox
from app.motor.consultas import serializar_tx

router = APIRouter(prefix="/seguimiento", tags=["Seguimiento"])
admin = require_roles("administrador")
lectura_global = require_roles("administrador", "auditoria", "disenador")


class Reasignar(BaseModel):
    user_id: str
    nombre: str
    email: Optional[str] = None
    motivo: str


@router.get("/instancias")
async def listar(status: Optional[str] = None, flujo_id: Optional[str] = None, origen_clave: Optional[str] = None, q: str = "",
                 db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Roles corporativos ven todo; los demás, solo donde participan (solicitante o aprobador)."""
    return await consultas.listar(db, user, status, flujo_id, origen_clave, q, solo_mios=False)


@router.get("/instancias/{instancia_id}")
async def detalle(instancia_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    inst = await consultas.obtener(db, instancia_id)
    return await consultas.detalle(db, inst, user)


@router.post("/instancias/{instancia_id}/reasignar")
async def reasignar(instancia_id: str, body: Reasignar, db: AsyncSession = Depends(get_db), user: dict = Depends(admin)):
    inst = await consultas.obtener(db, instancia_id)
    etapas = await consultas.etapas_de(db, inst.id)
    en_turno = next((e for e in etapas if e.status == "en_turno"), None)
    if not en_turno:
        raise HTTPException(status_code=409, detail="El trámite no tiene una etapa en turno")
    if not body.motivo.strip():
        raise HTTPException(status_code=422, detail="Escribe el motivo de la reasignación")
    await motor.reasignar(db, inst, en_turno, {"id": body.user_id, "name": body.nombre, "email": body.email}, body.motivo.strip(), user)
    await db.commit()
    return await consultas.detalle(db, inst, user)


@router.post("/instancias/{instancia_id}/reprocesar")
async def reprocesar(instancia_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(admin)):
    """Para un trámite en error de configuración, después de capturar el grupo que faltaba."""
    inst = await consultas.obtener(db, instancia_id)
    await motor.reprocesar_configuracion(db, inst, user)
    await db.commit()
    if inst.status in ("aprobada",):
        from app.rabbitmq import publicar_resultados_pendientes
        await publicar_resultados_pendientes(inst.id)
    return await consultas.detalle(db, inst, user)


@router.get("/transacciones")
async def transacciones(estado: Optional[str] = None, instancia_id: Optional[str] = None, limite: int = 200,
                        db: AsyncSession = Depends(get_db), user: dict = Depends(lectura_global)):
    stmt = select(Transaccion, Instancia).join(Instancia, Instancia.id == Transaccion.instancia_id, isouter=True)
    if estado:
        stmt = stmt.where(Transaccion.estado == estado)
    if instancia_id:
        stmt = stmt.where(Transaccion.instancia_id == instancia_id)
    filas = (await db.execute(stmt.order_by(Transaccion.created_at.desc()).limit(min(limite, 1000)))).all()
    return [serializar_tx(t, i) for t, i in filas]


@router.get("/transacciones/{tx_id}")
async def transaccion(tx_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(lectura_global)):
    t = (await db.execute(select(Transaccion).where(Transaccion.id == tx_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    inst = (await db.execute(select(Instancia).where(Instancia.id == t.instancia_id))).scalar_one_or_none()
    d = serializar_tx(t, inst)
    d["payload"] = t.payload
    d["respuesta_body"] = t.respuesta_body
    return d


@router.post("/transacciones/{tx_id}/reenviar")
async def reenviar(tx_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(admin)):
    t = (await db.execute(select(Transaccion).where(Transaccion.id == tx_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    r = await outbox.reenviar_manual(db, t, user)
    return {**r, "transaccion": serializar_tx(t)}
