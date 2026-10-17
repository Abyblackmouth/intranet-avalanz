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


def vista_de(user: Dict[str, Any], inst: Instancia, etapas: List[InstanciaEtapa]) -> str:
    """Que tanto ve quien abre el tramite: administrador (todo) | solicitante (etapas sin nombres) | aprobador (solo lo suyo).
    Un aprobador que ademas administra, ve todo; un solicitante que ademas aprueba, ve la vista de solicitante."""
    if ve_todo(user):
        return "administrador"
    if inst.requester_user_id == user.get("user_id"):
        return "solicitante"
    return "aprobador"


def _sin_nombres(e: Dict[str, Any]) -> Dict[str, Any]:
    """Etapa para el solicitante: estado y nombre de la etapa, sin quien la aprueba."""
    return {**e, "aprobador_user_id": None, "aprobador_nombre": "", "aprobador_email": None, "suplente_user_id": None, "suplente_nombre": None,
            "decidio_user_id": None, "decidio_nombre": None, "decidio_id_externo": None}


async def detalle(db: AsyncSession, inst: Instancia, user: Dict[str, Any], con_urls: bool = True, vista_forzada: Optional[str] = None) -> Dict[str, Any]:
    etapas = await etapas_de(db, inst.id)
    if not ve_todo(user) and not participa(user.get("user_id"), inst, etapas) and not vista_forzada:
        raise HTTPException(status_code=403, detail="No participas en este trámite")
    vista = vista_forzada or vista_de(user, inst, etapas)
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
    d["vista"] = vista
    d["total_etapas"] = len(etapas)
    if vista == "aprobador":
        # Solo lo suyo: su etapa, los datos y los archivos. Nada de la cascada ni del historial.
        d["mi_etapa"] = serializar_etapa(en_turno) if en_turno and uid in (en_turno.aprobador_user_id, en_turno.suplente_user_id) else None
        d["etapas"], d["bitacora"], d["correos"], d["transacciones"] = [], [], [], []
        d["grupo_nombre"] = ""
    elif vista == "solicitante":
        # Ve con quien esta cada etapa (para saber a quien ir), pero no correos ajenos ni transacciones
        d["bitacora"] = [{**b, "detail": {k: v for k, v in (b.get("detail") or {}).items() if k in ("etapa", "nombre", "nota", "motivo", "aprobador", "comentario")}}
                         for b in d["bitacora"] if b["accion"] in ("recibido", "en_turno", "etapa_aprobada", "rechazada", "aprobada", "afectacion_aplicada", "afectacion_fallida", "afectacion_abandonada", "reenvio_aviso", "sustituida", "error_configuracion")]
        d["correos"] = [c for c in d["correos"] if c["email"] == inst.requester_email]
        d["transacciones"] = []
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
    todo = ve_todo(user)
    for i in insts:
        d = serializar_instancia(i, None, conexiones.get(i.conexion_id), flujos.get(i.flujo_id).nombre if flujos.get(i.flujo_id) else None)
        e = en_turno.get(i.id)
        me_toca = bool(e and uid in (e.aprobador_user_id, e.suplente_user_id))
        soy_solicitante = i.requester_user_id == uid
        d["etapa_en_turno"] = (serializar_etapa(e) if (todo or me_toca or soy_solicitante) else _sin_nombres(serializar_etapa(e))) if e else None
        d["me_toca"] = me_toca
        d["total"] = (i.card_data or {}).get("total")
        if not todo and not me_toca and not soy_solicitante:
            d["grupo_nombre"] = ""
        out.append(d)
    return out
