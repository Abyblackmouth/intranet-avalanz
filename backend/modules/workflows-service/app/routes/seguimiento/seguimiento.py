"""Seguimiento: todos los trámites (según scope), transacciones con las plataformas y acciones de administración."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import Instancia, Transaccion
from app.motor import avisos, consultas
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


@router.get("/resumen")
async def resumen(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Contadores para Inicio: lo que me toca, en aprobación, aprobados sin aplicar, con error de configuración."""
    todos = await consultas.listar(db, user, None, None, None, "", solo_mios=False, limite=2000)
    return {
        "me_toca": sum(1 for t in todos if t["me_toca"]),
        "en_aprobacion": sum(1 for t in todos if t["status"] == "en_aprobacion"),
        "sin_aplicar": sum(1 for t in todos if t["status"] in ("aprobada", "rechazada") and t["afectacion"] == "fallida"),
        "error_configuracion": sum(1 for t in todos if t["status"] == "error_configuracion"),
        "mis_tramites": sum(1 for t in todos if t["requester"]["user_id"] == user.get("user_id")),
        "ultimos": todos[:8],
        "ve_todo": consultas.ve_todo(user),
    }


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
    tokens = await motor.reasignar(db, inst, en_turno, {"id": body.user_id, "name": body.nombre, "email": body.email}, body.motivo.strip(), user)
    await db.commit()
    await avisos.notificar_turno(db, inst, {"etapa_id": en_turno.id, "tokens": tokens}, por=user)
    return await consultas.detalle(db, inst, user)


@router.post("/instancias/{instancia_id}/reprocesar")
async def reprocesar(instancia_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(admin)):
    """Para un trámite en error de configuración, después de capturar el grupo que faltaba."""
    inst = await consultas.obtener(db, instancia_id)
    aviso = await motor.reprocesar_configuracion(db, inst, user)
    await db.commit()
    if aviso:
        await avisos.notificar_turno(db, inst, aviso, por=user)
    if inst.status in ("aprobada",):
        await avisos.notificar_decision(db, inst, "decidida")
        from app.rabbitmq import publicar_resultados_pendientes
        await publicar_resultados_pendientes(inst.id)
    return await consultas.detalle(db, inst, user)


@router.post("/instancias/{instancia_id}/reenviar-aviso")
async def reenviar_aviso(instancia_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Para el «no me llegó»: liga nueva (la anterior se invalida) y correo otra vez al aprobador en turno.
    Lo puede pedir el solicitante o un administrador del módulo."""
    inst = await consultas.obtener(db, instancia_id)
    if not (consultas.es_admin_modulo(user) or inst.requester_user_id == user.get("user_id")):
        raise HTTPException(status_code=403, detail="Solo el solicitante o un administrador pueden reenviar el aviso")
    etapas = await consultas.etapas_de(db, inst.id)
    en_turno = next((e for e in etapas if e.status == "en_turno"), None)
    if not en_turno:
        raise HTTPException(status_code=409, detail="El trámite no tiene una etapa en turno")
    from app.models import CorreoEnviado
    ultimo = (await db.execute(select(CorreoEnviado).where(CorreoEnviado.instancia_id == inst.id, CorreoEnviado.etapa_id == en_turno.id).order_by(CorreoEnviado.enviado_en.desc()))).scalars().first()
    await motor.invalidar_tokens(db, inst.id, en_turno.id)
    tokens = {}
    for uid in [en_turno.aprobador_user_id, en_turno.suplente_user_id]:
        if uid:
            tokens[uid] = await motor.emitir_token(db, inst, en_turno, uid)
    motor.bitacora(db, inst.id, "reenvio_aviso", user, {"etapa": en_turno.orden, "aprobador": en_turno.aprobador_nombre})
    await db.commit()
    await avisos.notificar_turno(db, inst, {"etapa_id": en_turno.id, "tokens": tokens}, reenvio_de=ultimo.id if ultimo else None, por=user)
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
