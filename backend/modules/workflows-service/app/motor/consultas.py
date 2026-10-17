"""Consultas de tramites para Bandeja, Seguimiento y la pagina publica: detalle completo y scope."""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import es_super_admin, get_flat_roles
from app.models import Bitacora, Conexion, CorreoEnviado, Flujo, Instancia, InstanciaArchivo, InstanciaEtapa, Transaccion
from app.motor.instancias import serializar_etapa, serializar_instancia

ROLES_TODO = ("administrador", "auditoria", "disenador")


def es_admin_modulo(user: Dict[str, Any]) -> bool:
    return es_super_admin(user) or "administrador" in get_flat_roles(user)


def ve_todo(user: Dict[str, Any]) -> bool:
    return es_super_admin(user) or any(r in get_flat_roles(user) for r in ROLES_TODO)


async def obtener(db: AsyncSession, instancia_id: str) -> Instancia:
    inst = (await db.execute(select(Instancia).where(Instancia.id == instancia_id))).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")
    return inst


async def etapas_de(db: AsyncSession, instancia_id: str) -> List[InstanciaEtapa]:
    return list((await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.instancia_id == instancia_id).order_by(InstanciaEtapa.orden))).scalars().all())


def participa(user_id: Optional[str], inst: Instancia, etapas: List[InstanciaEtapa]) -> bool:
    if not user_id:
        return False
    if inst.requester_user_id == user_id:
        return True
    return any(user_id in (e.aprobador_user_id, e.suplente_user_id, e.decidio_user_id) for e in etapas)


async def detalle(db: AsyncSession, inst: Instancia, user: Dict[str, Any], con_urls: bool = True) -> Dict[str, Any]:
    etapas = await etapas_de(db, inst.id)
    if not ve_todo(user) and not participa(user.get("user_id"), inst, etapas):
        raise HTTPException(status_code=403, detail="No participas en este trámite")
    conexion = (await db.execute(select(Conexion).where(Conexion.id == inst.conexion_id))).scalar_one_or_none()
    flujo = (await db.execute(select(Flujo).where(Flujo.id == inst.flujo_id))).scalar_one_or_none()
    d = serializar_instancia(inst, etapas, conexion, flujo.nombre if flujo else None)
    archivos = (await db.execute(select(InstanciaArchivo).where(InstanciaArchivo.instancia_id == inst.id).order_by(InstanciaArchivo.uploaded_at))).scalars().all()
    d["archivos"] = []
    for a in archivos:
        item = {"id": a.id, "tipo": a.tipo, "nombre": a.original_name, "mime_type": a.mime_type, "size_bytes": a.size_bytes, "sha256": a.sha256, "uploaded_at": a.uploaded_at.isoformat()}
        if con_urls:
            try:
                from app.motor.archivos import url_firmada
                item["url"] = url_firmada(a.object_key, a.bucket)
            except Exception:
                item["url"] = None
        d["archivos"].append(item)
    bit = (await db.execute(select(Bitacora).where(Bitacora.instancia_id == inst.id).order_by(Bitacora.performed_at.desc()))).scalars().all()
    d["bitacora"] = [{"accion": b.accion, "por": b.performed_by_name, "rol": b.performed_by_role, "fecha": b.performed_at.isoformat(), "detail": b.detail} for b in bit]
    correos = (await db.execute(select(CorreoEnviado).where(CorreoEnviado.instancia_id == inst.id).order_by(CorreoEnviado.enviado_en.desc()))).scalars().all()
    d["correos"] = [{"id": c.id, "plantilla": c.plantilla, "para": c.destinatario_nombre or c.destinatario_email, "email": c.destinatario_email, "fecha": c.enviado_en.isoformat(), "resultado": c.resultado, "reenvio": bool(c.reenvio_de_id)} for c in correos]
    txs = (await db.execute(select(Transaccion).where(Transaccion.instancia_id == inst.id).order_by(Transaccion.created_at.desc()))).scalars().all()
    d["transacciones"] = [serializar_tx(t, inst) for t in txs]
    uid = user.get("user_id")
    en_turno = next((e for e in etapas if e.status == "en_turno"), None)
    d["puedo_decidir"] = bool(en_turno and uid in (en_turno.aprobador_user_id, en_turno.suplente_user_id))
    d["puedo_administrar"] = es_admin_modulo(user)
    d["soy_solicitante"] = inst.requester_user_id == uid
    return d


def serializar_tx(t: Transaccion, inst: Optional[Instancia] = None) -> Dict[str, Any]:
    return {"id": t.id, "instancia_id": t.instancia_id, "folio": inst.folio if inst else None, "direccion": t.direccion, "tipo": t.tipo, "estado": t.estado,
            "intento": t.intento, "proximo_intento": t.proximo_intento.isoformat() if t.proximo_intento else None,
            "respuesta_status": t.respuesta_status, "respuesta_body": (t.respuesta_body or "")[:500], "error": t.error,
            "created_at": t.created_at.isoformat() if t.created_at else None, "updated_at": t.updated_at.isoformat() if t.updated_at else None}


async def listar(db: AsyncSession, user: Dict[str, Any], status: Optional[str], flujo_id: Optional[str], origen_clave: Optional[str], q: str, solo_mios: bool, limite: int = 500) -> List[Dict[str, Any]]:
    uid = user.get("user_id")
    stmt = select(Instancia)
    if status:
        stmt = stmt.where(Instancia.status == status)
    if flujo_id:
        stmt = stmt.where(Instancia.flujo_id == flujo_id)
    if origen_clave:
        stmt = stmt.where(Instancia.origen_clave == origen_clave)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Instancia.folio.ilike(like), Instancia.requester_nombre.ilike(like), Instancia.external_key.ilike(like), Instancia.company_name.ilike(like)))
    if solo_mios or not ve_todo(user):
        ids_part = select(InstanciaEtapa.instancia_id).where(or_(InstanciaEtapa.aprobador_user_id == uid, InstanciaEtapa.suplente_user_id == uid, InstanciaEtapa.decidio_user_id == uid))
        stmt = stmt.where(or_(Instancia.requester_user_id == uid, Instancia.id.in_(ids_part)))
    insts = (await db.execute(stmt.order_by(Instancia.created_at.desc()).limit(limite))).scalars().all()
    if not insts:
        return []
    ids = [i.id for i in insts]
    etapas = (await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.instancia_id.in_(ids), InstanciaEtapa.status == "en_turno"))).scalars().all()
    en_turno = {e.instancia_id: e for e in etapas}
    conexiones = {c.id: c for c in (await db.execute(select(Conexion))).scalars().all()}
    flujos = {f.id: f for f in (await db.execute(select(Flujo))).scalars().all()}
    out = []
    for i in insts:
        d = serializar_instancia(i, None, conexiones.get(i.conexion_id), flujos.get(i.flujo_id).nombre if flujos.get(i.flujo_id) else None)
        e = en_turno.get(i.id)
        d["etapa_en_turno"] = serializar_etapa(e) if e else None
        d["me_toca"] = bool(e and uid in (e.aprobador_user_id, e.suplente_user_id))
        d["total"] = (i.card_data or {}).get("total")
        out.append(d)
    return out
