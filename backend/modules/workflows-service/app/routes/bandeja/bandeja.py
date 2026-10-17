"""Bandeja: lo que me toca aprobar, el detalle del trámite y la decisión."""
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.motor import avisos, consultas
from app.motor import instancias as motor
from app.motor.consultas import es_admin_modulo

router = APIRouter(prefix="/bandeja", tags=["Bandeja"])


class Decision(BaseModel):
    aprobar: bool
    comentario: Optional[str] = ""


@router.get("")
async def mis_tramites(filtro: str = "mias", q: str = "", db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """filtro: mias (me toca decidir ahora) | decididas (ya decidí) | participo (todas donde aparezco)."""
    lista = await consultas.listar(db, user, None, None, None, q, solo_mios=True)
    uid = user.get("user_id")
    if filtro == "mias":
        return [t for t in lista if t["me_toca"]]
    if filtro == "decididas":
        ids = set()
        from sqlalchemy import select
        from app.models import InstanciaEtapa
        res = await db.execute(select(InstanciaEtapa.instancia_id).where(InstanciaEtapa.decidio_user_id == uid))
        ids = {r[0] for r in res.all()}
        return [t for t in lista if t["id"] in ids]
    return lista


@router.get("/{instancia_id}")
async def detalle(instancia_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    inst = await consultas.obtener(db, instancia_id)
    return await consultas.detalle(db, inst, user)


@router.post("/{instancia_id}/decidir")
async def decidir(instancia_id: str, body: Decision, request: Request, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    inst = await consultas.obtener(db, instancia_id)
    etapas = await consultas.etapas_de(db, inst.id)
    en_turno = next((e for e in etapas if e.status == "en_turno"), None)
    if not en_turno:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="El trámite no tiene una etapa en turno")
    actor = {**user, "_admin": es_admin_modulo(user)}
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else None)
    aviso = await motor.decidir(db, inst, en_turno, body.aprobar, body.comentario or "", actor, via="bandeja", ip=ip)
    await db.commit()
    await avisos.notificar_avance(db, inst, en_turno, body.aprobar, user.get("full_name") or "")
    if aviso:
        await avisos.notificar_turno(db, inst, aviso)
    if inst.status in ("aprobada", "rechazada"):
        await avisos.notificar_decision(db, inst, "decidida")
        from app.rabbitmq import publicar_resultados_pendientes
        await publicar_resultados_pendientes(inst.id)
    return await consultas.detalle(db, inst, user)
