"""Página pública de la liga del correo: /aprobar/{token}. Sin JWT; el token es personal, de un solo uso y vence."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AprobacionToken, Instancia, InstanciaEtapa
from app.motor import avisos, consultas
from app.motor import instancias as motor
from app.motor.instancias import ahora

router = APIRouter(prefix="/public", tags=["Público"])


class Decision(BaseModel):
    aprobar: bool
    comentario: Optional[str] = ""


async def _token_vigente(db: AsyncSession, token: str):
    t = (await db.execute(select(AprobacionToken).where(AprobacionToken.token == token))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Esta liga no existe")
    inst = (await db.execute(select(Instancia).where(Instancia.id == t.instancia_id))).scalar_one()
    etapa = (await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.id == t.etapa_id))).scalar_one()
    estado = "vigente"
    if t.used_at:
        estado = "usada"
    elif t.invalidado_en:
        estado = "invalidada"
    elif t.expires_at < ahora():
        estado = "vencida"
    elif inst.status != "en_aprobacion" or etapa.status != "en_turno":
        estado = "cerrada"
    return t, inst, etapa, estado


@router.get("/aprobar/{token}")
async def ver(token: str, db: AsyncSession = Depends(get_db)):
    """Lo que ve el aprobador al abrir la liga: el trámite completo y si todavía puede decidir."""
    t, inst, etapa, estado = await _token_vigente(db, token)
    actor = {"user_id": t.user_id, "roles": []}
    d = await _detalle_publico(db, inst, actor)
    d["liga"] = {"estado": estado, "etapa_orden": etapa.orden, "etapa_nombre": etapa.nombre, "expira": t.expires_at.isoformat(),
                 "decido_como": etapa.aprobador_nombre if t.user_id == etapa.aprobador_user_id else (etapa.suplente_nombre or ""),
                 "mensaje": {"vigente": "", "usada": "Esta liga ya se usó. Si necesitas ver el trámite, entra a la Intranet.",
                             "invalidada": "Esta liga ya no es válida (se reenvió el aviso o se reasignó la etapa). Usa la liga más reciente o entra a la Intranet.",
                             "vencida": "Esta liga venció. Pide que te reenvíen el aviso o entra a la Intranet.",
                             "cerrada": "Este trámite ya fue decidido."}[estado]}
    return d


async def _detalle_publico(db: AsyncSession, inst: Instancia, actor: dict) -> dict:
    """Mismo detalle que la Bandeja, pero sin validar scope por JWT: el token ya es la autorización."""
    from app.motor.consultas import detalle
    return await detalle(db, inst, actor, con_urls=True, vista_forzada="aprobador")


@router.post("/aprobar/{token}/decidir")
async def decidir(token: str, body: Decision, request: Request, db: AsyncSession = Depends(get_db)):
    t, inst, etapa, estado = await _token_vigente(db, token)
    if estado != "vigente":
        raise HTTPException(status_code=409, detail={"usada": "Esta liga ya se usó", "invalidada": "Esta liga ya no es válida", "vencida": "Esta liga venció", "cerrada": "Este trámite ya fue decidido"}[estado])
    nombre = etapa.aprobador_nombre if t.user_id == etapa.aprobador_user_id else (etapa.suplente_nombre or "")
    email = etapa.aprobador_email if t.user_id == etapa.aprobador_user_id else etapa.suplente_email
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else None)
    actor = {"user_id": t.user_id, "full_name": nombre, "email": email, "rol": "aprobador (liga)"}
    t.used_at, t.ip_address, t.user_agent = ahora(), ip, (request.headers.get("user-agent") or "")[:255]
    aviso = await motor.decidir(db, inst, etapa, body.aprobar, body.comentario or "", actor, via="liga", ip=ip)
    await db.commit()
    await avisos.notificar_avance(db, inst, etapa, body.aprobar, nombre)
    if aviso:
        await avisos.notificar_turno(db, inst, aviso)
    if inst.status in ("aprobada", "rechazada"):
        await avisos.notificar_decision(db, inst, "decidida")
        from app.rabbitmq import publicar_resultados_pendientes
        await publicar_resultados_pendientes(inst.id)
    return {"ok": True, "status": inst.status, "folio": inst.folio, "mensaje": "Gracias, tu decisión quedó registrada." + (" El trámite sigue con el siguiente aprobador." if inst.status == "en_aprobacion" else " El trámite quedó cerrado.")}
