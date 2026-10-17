"""Motor · transacciones (bandeja de salida hacia las plataformas).

Cuando un tramite cierra, el resultado se guarda primero como transaccion
pendiente_envio y despues se intenta enviar (consumidor de RabbitMQ y, por
si acaso, un barrido periodico). 5xx y timeout reintentan con el espaciado
de la conexion; 4xx se abandona (reintentar no lo arregla). Nada se pierde:
todo esta en la base antes de intentar nada.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conexion, Instancia, InstanciaEtapa, Transaccion
from app.motor.instancias import bitacora

logger = logging.getLogger("avalanz")


def ahora() -> datetime:
    return datetime.now(timezone.utc)


async def armar_resultado(db: AsyncSession, inst: Instancia) -> Dict[str, Any]:
    """El sobre de regreso: todo lo que llego intacto + decision + history + documents."""
    entrada = (await db.execute(select(Transaccion).where(Transaccion.instancia_id == inst.id, Transaccion.direccion == "entrada").order_by(Transaccion.created_at.desc()))).scalars().first()
    sobre = dict(entrada.payload) if entrada and isinstance(entrada.payload, dict) else {}
    sobre.pop("files", None)
    etapas = (await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.instancia_id == inst.id).order_by(InstanciaEtapa.orden))).scalars().all()
    history = []
    reject_reason = ""
    for e in etapas:
        if e.status in ("aprobada", "rechazada") and e.decidio_en:
            history.append({"step": e.orden, "stepName": e.nombre, "action": "approved" if e.status == "aprobada" else "rejected",
                            "approver": {"id": e.decidio_id_externo, "login": None, "name": e.decidio_nombre, "email": e.decidio_email},
                            "date": e.decidio_en.astimezone(timezone(timedelta(hours=-6))).isoformat(), "comment": e.comentario or ""})
            if e.status == "rechazada":
                reject_reason = e.comentario or ""
    from app.models import InstanciaArchivo
    docs = (await db.execute(select(InstanciaArchivo).where(InstanciaArchivo.instancia_id == inst.id, InstanciaArchivo.tipo.in_(["acta", "adjunto_aprobador", "salida"])))).scalars().all()
    return {
        **sobre,
        "processId": inst.process_id, "resultService": inst.result_service, "externalKey": inst.external_key,
        "tenantId": inst.tenant_id, "companyGroup": inst.company_group, "companyName": inst.company_name,
        "cardData": inst.card_data,
        "instanceId": inst.id, "folio": inst.folio, "approved": bool(inst.approved), "rejectReason": reject_reason,
        "history": history,
        "documents": [{"name": d.original_name, "objectKey": d.object_key, "sha256": d.sha256} for d in docs],
    }


async def encolar_resultado(db: AsyncSession, inst: Instancia, motivo: str) -> Transaccion:
    """Guarda el resultado como pendiente_envio. Quien llama hace commit y luego dispara el envio."""
    payload = await armar_resultado(db, inst)
    tx = Transaccion(instancia_id=inst.id, conexion_id=inst.conexion_id, flujo_id=inst.flujo_id, direccion="salida", tipo="resultado",
                     estado="pendiente_envio", intento=0, proximo_intento=ahora(), payload=payload)
    db.add(tx)
    inst.afectacion = "pendiente"
    bitacora(db, inst.id, "resultado_encolado", None, {"motivo": motivo, "resultService": inst.result_service})
    return tx


def _espaciado(conexion: Conexion, intento: int) -> int:
    esp = [int(x) for x in (conexion.espaciado_min or [1, 5, 15, 60, 240])]
    return esp[min(max(intento - 1, 0), len(esp) - 1)]


async def procesar(db: AsyncSession, tx: Transaccion) -> Dict[str, Any]:
    """Un intento de envio. Actualiza la transaccion y la afectacion del tramite. Hace commit."""
    from app.plataformas import conector_para
    if tx.estado not in ("pendiente_envio", "error"):
        return {"estado": tx.estado, "error": "La transacción no está pendiente; para una abandonada usa reenviar"}
    conexion = (await db.execute(select(Conexion).where(Conexion.id == tx.conexion_id))).scalar_one()
    inst = (await db.execute(select(Instancia).where(Instancia.id == tx.instancia_id))).scalar_one()
    tx.intento += 1
    if not conexion.activa:
        tx.estado, tx.error = "error", "Conexión inactiva"
        tx.proximo_intento = ahora() + timedelta(minutes=_espaciado(conexion, tx.intento))
        inst.afectacion = "fallida"
        await db.commit()
        return {"estado": tx.estado, "error": tx.error}
    conector = conector_para(conexion)
    r = await conector.enviar_resultado(inst, tx.payload)
    tx.respuesta_status, tx.respuesta_body, tx.error = r.get("status"), (r.get("body") or "")[:4000], r.get("error")
    tx.updated_at = ahora()
    if r["ok"]:
        tx.estado = "enviado"
        tx.proximo_intento = None
        inst.afectacion, inst.afectada_en, inst.mensaje_plataforma = "aplicada", ahora(), r.get("mensaje")
        bitacora(db, inst.id, "afectacion_aplicada", None, {"status": r.get("status"), "mensaje": r.get("mensaje"), "intento": tx.intento})
    elif r.get("reintentar", True) and tx.intento < (conexion.reintentos_max or 0):
        tx.estado = "error"
        tx.proximo_intento = ahora() + timedelta(minutes=_espaciado(conexion, tx.intento))
        inst.afectacion = "fallida"
        bitacora(db, inst.id, "afectacion_fallida", None, {"status": r.get("status"), "error": r.get("error"), "intento": tx.intento, "proximo": tx.proximo_intento.isoformat()})
    else:
        tx.estado = "abandonado"
        tx.proximo_intento = None
        inst.afectacion = "fallida"
        bitacora(db, inst.id, "afectacion_abandonada", None, {"status": r.get("status"), "error": r.get("error"), "intento": tx.intento})
    await db.commit()
    return {"estado": tx.estado, "status": r.get("status"), "error": r.get("error"), "mensaje": r.get("mensaje")}


async def pendientes(db: AsyncSession, limite: int = 20):
    """Las que toca intentar ahora: pendiente_envio, o error con proximo_intento vencido."""
    res = await db.execute(select(Transaccion).where(Transaccion.direccion == "salida",
                                                     ((Transaccion.estado == "pendiente_envio") | ((Transaccion.estado == "error") & (Transaccion.proximo_intento <= ahora())))
                                                     ).order_by(Transaccion.proximo_intento).limit(limite))
    return list(res.scalars().all())


async def reenviar_manual(db: AsyncSession, tx: Transaccion, user: Dict[str, Any]) -> Dict[str, Any]:
    """Boton 'Reenviar ahora' de Seguimiento: una abandonada vuelve a la cola y se intenta de inmediato."""
    if tx.direccion != "salida":
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Solo se reenvían las transacciones de salida")
    if tx.estado == "abandonado":
        tx.intento = 0
    bitacora(db, tx.instancia_id, "reenvio_manual", user, {"transaccion": tx.id, "estado_anterior": tx.estado})
    tx.estado = "pendiente_envio"
    tx.proximo_intento = ahora()
    await db.commit()
    return await procesar(db, tx)
