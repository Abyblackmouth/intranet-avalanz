"""Motor · instancias (tramites).

Recibe el sobre de una plataforma, crea el tramite con snapshot de todo,
resuelve el grupo, arma las etapas y las va moviendo con cada decision.
Regla de la casa: primero se guarda y se hace commit; avisos (campana, correo,
tiempo real) y el regreso a la plataforma son "mejor esfuerzo" despues.
"""
import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (SYSTEM_ACTOR_ID, AprobacionToken, Bitacora, Conexion, ConexionUsuario, Flujo, FlujoVersion,
                        FolioCounter, Instancia, InstanciaEtapa, Transaccion)
from app.motor.grupos import armar_etapas, resolver_grupo
from app.services.ajustes import ajustes_service

logger = logging.getLogger("avalanz")

ABIERTA = "en_aprobacion"


def ahora() -> datetime:
    return datetime.now(timezone.utc)


# ── Bitacora y folio ──────────────────────────────────────────────────────

def bitacora(db: AsyncSession, instancia_id: str, accion: str, user: Optional[Dict[str, Any]] = None, detail: Optional[Dict[str, Any]] = None, ip: Optional[str] = None) -> None:
    db.add(Bitacora(
        instancia_id=instancia_id, accion=accion,
        performed_by=(user or {}).get("user_id") or SYSTEM_ACTOR_ID,
        performed_by_name=(user or {}).get("full_name") or "Sistema",
        performed_by_role=(user or {}).get("rol") or ("usuario" if user else "sistema"),
        ip_address=ip, detail=detail,
    ))


async def generar_folio(db: AsyncSession) -> str:
    """PREFIJO-FAMILIA-000001 con SELECT ... FOR UPDATE: dos envios al mismo tiempo nunca repiten folio."""
    prefijo = await ajustes_service.obtener(db, "folio.prefijo")
    familia = await ajustes_service.obtener(db, "folio.familia")
    res = await db.execute(select(FolioCounter).where(FolioCounter.prefix == prefijo, FolioCounter.family_clave == familia).with_for_update())
    c = res.scalar_one_or_none()
    if not c:
        c = FolioCounter(prefix=prefijo, family_clave=familia, last_number=0)
        db.add(c)
        await db.flush()
        res = await db.execute(select(FolioCounter).where(FolioCounter.id == c.id).with_for_update())
        c = res.scalar_one()
    c.last_number += 1
    return f"{prefijo}-{familia}-{c.last_number:06d}"


# ── Identidad del solicitante ─────────────────────────────────────────────

async def _buscar_intranet_por_email(email: str) -> Optional[Dict[str, Any]]:
    from app.services.ajustes.usuarios_service import buscar_intranet
    for u in await buscar_intranet(email):
        if (u.get("email") or "").lower() == email.lower():
            return u
    return None


async def ligar_requester(db: AsyncSession, conexion: Conexion, requester: Dict[str, Any]) -> Optional[str]:
    """Busca el usuario de la Intranet por id de la plataforma; si no esta ligado y viene correo,
    lo empata y guarda la liga. Regresa user_id o None (el tramite igual se crea)."""
    id_externo = str(requester.get("id") or "").strip()
    res = await db.execute(select(ConexionUsuario).where(ConexionUsuario.conexion_id == conexion.id, ConexionUsuario.id_externo == id_externo))
    u = res.scalar_one_or_none()
    if u is None:
        u = ConexionUsuario(conexion_id=conexion.id, id_externo=id_externo)
        db.add(u)
    u.login_externo = requester.get("login") or u.login_externo
    u.nombre = requester.get("name") or u.nombre or ""
    u.email = requester.get("email") or u.email
    u.ultima_vez = ahora()
    if not u.user_id and u.email:
        try:
            encontrado = await _buscar_intranet_por_email(u.email)
        except Exception:
            encontrado = None
        if encontrado:
            u.user_id = encontrado["id"]
    await db.flush()
    return u.user_id


# ── Recepcion del sobre ───────────────────────────────────────────────────

def _hash(d: Any) -> str:
    return hashlib.sha256(json.dumps(d, sort_keys=True, default=str).encode()).hexdigest()


async def resolver_flujo(db: AsyncSession, conexion: Conexion, process_id: str) -> Flujo:
    flujos = (await db.execute(select(Flujo).where(Flujo.conexion_id == conexion.id))).scalars().all()
    pid = process_id.strip().lower()
    for f in flujos:
        if f.process_id.lower() == pid or pid in [a.lower() for a in (f.aliases or [])]:
            if not f.activo:
                raise HTTPException(status_code=409, detail=f"El flujo «{f.process_id}» está inactivo")
            return f
    raise HTTPException(status_code=404, detail=f"processId «{process_id}» desconocido en la plataforma {conexion.slug}")


async def recibir(db: AsyncSession, conexion: Conexion, sobre: Dict[str, Any], archivos_guardados: List[Dict[str, Any]], ip: Optional[str]) -> Dict[str, Any]:
    """Crea el tramite. Devuelve {'instancia': Instancia, 'nueva': bool}.
    archivos_guardados: lo que ya subio a MinIO la ruta de integracion (object_key, sha256...)."""
    flujo = await resolver_flujo(db, conexion, sobre["processId"])
    origen_clave = f"{sobre['companyGroup']}|{sobre['tenantId'][:2]}"
    external_key = sobre["externalKey"].strip()
    card_data = sobre.get("cardData") or {}

    # Idempotencia y Modificar
    abierta = (await db.execute(select(Instancia).where(Instancia.conexion_id == conexion.id, Instancia.external_key == external_key, Instancia.status == ABIERTA))).scalar_one_or_none()
    if abierta:
        if _hash(abierta.card_data) == _hash(card_data):
            bitacora(db, abierta.id, "reenvio_ignorado", None, {"nota": "Llegó el mismo sobre otra vez; se contesta con el trámite existente"})
            await db.commit()
            return {"instancia": abierta, "nueva": False}
        # Modificar: el abierto se sustituye y nace uno nuevo
        abierta.status = "sustituida"
        abierta.etapa_actual = None
        await db.execute(update(InstanciaEtapa).where(InstanciaEtapa.instancia_id == abierta.id, InstanciaEtapa.status.in_(["pendiente", "en_turno"])).values(status="no_alcanzada", nota="El trámite fue sustituido por una modificación"))
        await invalidar_tokens(db, abierta.id)
        bitacora(db, abierta.id, "sustituida", None, {"nota": "Llegó una modificación desde la plataforma"})

    version = (await db.execute(select(FlujoVersion).where(FlujoVersion.flujo_id == flujo.id, FlujoVersion.vigente == True))).scalar_one_or_none()  # noqa: E712
    definicion = (version.definicion if version else {"grupos": []})
    requester = sobre["requester"]
    user_id = await ligar_requester(db, conexion, requester)

    inst = Instancia(
        folio=await generar_folio(db), flujo_id=flujo.id, version_id=version.id if version else None, conexion_id=conexion.id,
        process_id=flujo.process_id, result_service=(sobre.get("resultService") or flujo.result_service or "").strip(),
        external_key=external_key, company_group=sobre["companyGroup"], tenant_id=sobre["tenantId"],
        company_name=sobre.get("companyName") or "", origen_clave=origen_clave,
        requester_id_externo=str(requester.get("id")), requester_login=requester.get("login"), requester_user_id=user_id,
        requester_nombre=requester.get("name") or "", requester_email=requester.get("email"),
        card_data=card_data, definicion={}, status=ABIERTA,
    )
    db.add(inst)
    await db.flush()
    if abierta:
        abierta.sustituida_por_id = inst.id

    db.add(Transaccion(instancia_id=inst.id, conexion_id=conexion.id, flujo_id=flujo.id, direccion="entrada", tipo="envio", estado="recibido",
                       intento=1, payload={**sobre, "files": [{"name": a["original_name"], "sha256": a["sha256"], "size": a["size_bytes"]} for a in archivos_guardados]}))
    for a in archivos_guardados:
        from app.models import InstanciaArchivo
        db.add(InstanciaArchivo(instancia_id=inst.id, tipo="entrada", original_name=a["original_name"], object_key=a["object_key"], bucket=a["bucket"],
                                mime_type=a.get("mime_type"), size_bytes=a.get("size_bytes"), sha256=a.get("sha256"), uploaded_by=SYSTEM_ACTOR_ID, uploaded_by_name=conexion.titulo))
    bitacora(db, inst.id, "recibido", None, {"plataforma": conexion.slug, "resultService": inst.result_service, "archivos": len(archivos_guardados)}, ip)

    # Grupo y etapas
    r = resolver_grupo(definicion.get("grupos", []), origen_clave, user_id)
    if not r["grupo"]:
        inst.status = "error_configuracion"
        bitacora(db, inst.id, "error_configuracion", None, {"nota": f"Sin grupo de aprobación para la empresa {origen_clave} en {flujo.process_id}"})
        await db.commit()
        return {"instancia": inst, "nueva": True}
    g = r["grupo"]
    inst.grupo_id = g.get("id")
    inst.grupo_nombre = g.get("nombre") or ""
    etapas = armar_etapas(g, card_data, user_id)
    inst.definicion = {"grupo": {"id": g.get("id"), "nombre": g.get("nombre"), "es_default": g.get("es_default"), "via": r["via"]}, "etapas": etapas, "version": flujo.version}
    for e in etapas:
        db.add(InstanciaEtapa(instancia_id=inst.id, orden=e["orden"], nombre=e["nombre"], tipo=e["tipo"], puesto_esperado=e.get("puesto_esperado"),
                              condicion=e.get("condicion"), aprobador_user_id=e.get("aprobador_user_id"), aprobador_nombre=e.get("aprobador_nombre") or "",
                              aprobador_email=e.get("aprobador_email"), suplente_user_id=e.get("suplente_user_id"), suplente_nombre=e.get("suplente_nombre"),
                              suplente_email=e.get("suplente_email"), status=e["status"], nota=e.get("nota") or None))
    bitacora(db, inst.id, "grupo_resuelto", None, {"grupo": g.get("nombre"), "via": r["via"], "etapas": len(etapas), "omitidas": sum(1 for e in etapas if e["status"] == "omitida")})
    await db.flush()
    aviso = await avanzar(db, inst)
    await db.commit()
    return {"instancia": inst, "nueva": True, "aviso": aviso}


# ── Avance y decision ─────────────────────────────────────────────────────

async def _etapas(db: AsyncSession, instancia_id: str) -> List[InstanciaEtapa]:
    return list((await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.instancia_id == instancia_id).order_by(InstanciaEtapa.orden))).scalars().all())


async def emitir_token(db: AsyncSession, inst: Instancia, etapa: InstanciaEtapa, user_id: str) -> str:
    dias = int(await ajustes_service.obtener(db, "tokens.vigencia_dias"))
    token = secrets.token_urlsafe(32)
    db.add(AprobacionToken(token=token, instancia_id=inst.id, etapa_id=etapa.id, user_id=user_id, expires_at=ahora() + timedelta(days=dias)))
    return token


async def invalidar_tokens(db: AsyncSession, instancia_id: str, etapa_id: Optional[str] = None) -> None:
    stmt = update(AprobacionToken).where(AprobacionToken.instancia_id == instancia_id, AprobacionToken.used_at.is_(None), AprobacionToken.invalidado_en.is_(None))
    if etapa_id:
        stmt = stmt.where(AprobacionToken.etapa_id == etapa_id)
    await db.execute(stmt.values(invalidado_en=ahora()))


async def avanzar(db: AsyncSession, inst: Instancia) -> Optional[Dict[str, Any]]:
    """Pone en turno la siguiente etapa pendiente; si no hay, cierra el tramite como aprobado
    y encola el resultado. No hace commit: lo hace quien llama.
    Regresa {'etapa_id', 'tokens': {user_id: token}} cuando hay a quien avisar (los avisos van despues del commit)."""
    etapas = await _etapas(db, inst.id)
    siguiente = next((e for e in etapas if e.status == "pendiente"), None)
    if siguiente:
        siguiente.status = "en_turno"
        siguiente.en_turno_desde = ahora()
        inst.etapa_actual = siguiente.orden
        tokens = {}
        for uid in [siguiente.aprobador_user_id, siguiente.suplente_user_id]:
            if uid:
                tokens[uid] = await emitir_token(db, inst, siguiente, uid)
        bitacora(db, inst.id, "en_turno", None, {"etapa": siguiente.orden, "nombre": siguiente.nombre, "aprobador": siguiente.aprobador_nombre, "suplente": siguiente.suplente_nombre})
        inst.updated_at = ahora()
        return {"etapa_id": siguiente.id, "tokens": tokens}
    inst.status = "aprobada"
    inst.approved = True
    inst.decidida_en = ahora()
    inst.etapa_actual = None
    inst.afectacion = "pendiente"
    inst.updated_at = ahora()
    bitacora(db, inst.id, "aprobada", None, {"nota": "Todas las etapas aprobadas"})
    from app.motor.transacciones import encolar_resultado
    await encolar_resultado(db, inst, motivo="aprobada")
    return None


async def decidir(db: AsyncSession, inst: Instancia, etapa: InstanciaEtapa, aprobar: bool, comentario: str, user: Dict[str, Any], via: str, ip: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Decision de un aprobador sobre la etapa en turno. via: 'bandeja' | 'liga'."""
    if inst.status != ABIERTA or etapa.status != "en_turno":
        raise HTTPException(status_code=409, detail="Esta etapa ya no está en turno")
    uid = user.get("user_id")
    if uid not in (etapa.aprobador_user_id, etapa.suplente_user_id) and not user.get("_admin"):
        raise HTTPException(status_code=403, detail="Esta etapa no te toca a ti")
    comentario = (comentario or "").strip()
    defin_etapa = next((x for x in (inst.definicion or {}).get("etapas", []) if x.get("orden") == etapa.orden), {})
    if not aprobar and not comentario and defin_etapa.get("comentario_rechazo_obligatorio", True):
        raise HTTPException(status_code=422, detail="Escribe el motivo del rechazo")
    etapa.decidio_user_id = uid
    etapa.decidio_nombre = user.get("full_name") or ""
    etapa.decidio_email = user.get("email")
    etapa.decidio_en = ahora()
    etapa.comentario = comentario or None
    # id del aprobador en la plataforma, para el history de regreso
    # Un usuario de la Intranet puede estar ligado a varios usuarios de la plataforma
    # (su usuario personal y, por ejemplo, uno generico). Se prefiere el del mismo correo.
    ligas = (await db.execute(select(ConexionUsuario).where(ConexionUsuario.conexion_id == inst.conexion_id, ConexionUsuario.user_id == uid)
                              .order_by(ConexionUsuario.id_externo))).scalars().all()
    correo = (user.get("email") or etapa.aprobador_email or "").lower()
    elegida = next((l for l in ligas if correo and (l.email or "").lower() == correo), ligas[0] if ligas else None)
    etapa.decidio_id_externo = elegida.id_externo if elegida else None
    await invalidar_tokens(db, inst.id, etapa.id)
    if aprobar:
        etapa.status = "aprobada"
        bitacora(db, inst.id, "etapa_aprobada", user, {"etapa": etapa.orden, "nombre": etapa.nombre, "comentario": comentario, "via": via}, ip)
        return await avanzar(db, inst)
    else:
        etapa.status = "rechazada"
        for e in await _etapas(db, inst.id):
            if e.status in ("pendiente", "en_turno") and e.id != etapa.id:
                e.status = "no_alcanzada"
                e.nota = "Una etapa anterior rechazó"
        inst.status = "rechazada"
        inst.approved = False
        inst.decidida_en = ahora()
        inst.etapa_actual = None
        inst.afectacion = "pendiente"
        inst.updated_at = ahora()
        await invalidar_tokens(db, inst.id)
        bitacora(db, inst.id, "rechazada", user, {"etapa": etapa.orden, "nombre": etapa.nombre, "comentario": comentario, "via": via}, ip)
        from app.motor.transacciones import encolar_resultado
        await encolar_resultado(db, inst, motivo="rechazada")
        return None


async def reasignar(db: AsyncSession, inst: Instancia, etapa: InstanciaEtapa, nuevo: Dict[str, Any], motivo: str, user: Dict[str, Any]) -> Dict[str, str]:
    """Cambia al aprobador de la etapa en turno (administrador), con motivo y bitacora. Regresa tokens nuevos."""
    if inst.status != ABIERTA or etapa.status != "en_turno":
        raise HTTPException(status_code=409, detail="Solo se puede reasignar la etapa en turno")
    anterior = etapa.aprobador_nombre
    etapa.aprobador_user_id = nuevo["id"]
    etapa.aprobador_nombre = nuevo.get("name") or ""
    etapa.aprobador_email = nuevo.get("email")
    etapa.nota = f"Reasignada de {anterior} ({motivo})"
    await invalidar_tokens(db, inst.id, etapa.id)
    token = await emitir_token(db, inst, etapa, nuevo["id"])
    bitacora(db, inst.id, "reasignada", user, {"etapa": etapa.orden, "de": anterior, "a": etapa.aprobador_nombre, "motivo": motivo})
    inst.updated_at = ahora()
    return {nuevo["id"]: token}


async def reprocesar_configuracion(db: AsyncSession, inst: Instancia, user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Para un tramite en error_configuracion: vuelve a resolver grupo con la definicion vigente."""
    if inst.status != "error_configuracion":
        raise HTTPException(status_code=409, detail="Solo aplica a trámites con error de configuración")
    flujo = (await db.execute(select(Flujo).where(Flujo.id == inst.flujo_id))).scalar_one()
    version = (await db.execute(select(FlujoVersion).where(FlujoVersion.flujo_id == flujo.id, FlujoVersion.vigente == True))).scalar_one_or_none()  # noqa: E712
    r = resolver_grupo((version.definicion if version else {}).get("grupos", []), inst.origen_clave, inst.requester_user_id)
    if not r["grupo"]:
        raise HTTPException(status_code=409, detail=f"Sigue sin haber grupo para {inst.origen_clave}; captúralo en Flujos")
    g = r["grupo"]
    inst.version_id = version.id if version else None
    inst.grupo_id, inst.grupo_nombre, inst.status = g.get("id"), g.get("nombre") or "", ABIERTA
    etapas = armar_etapas(g, inst.card_data or {}, inst.requester_user_id)
    inst.definicion = {"grupo": {"id": g.get("id"), "nombre": g.get("nombre"), "es_default": g.get("es_default"), "via": r["via"]}, "etapas": etapas, "version": flujo.version}
    for e in etapas:
        db.add(InstanciaEtapa(instancia_id=inst.id, orden=e["orden"], nombre=e["nombre"], tipo=e["tipo"], puesto_esperado=e.get("puesto_esperado"), condicion=e.get("condicion"),
                              aprobador_user_id=e.get("aprobador_user_id"), aprobador_nombre=e.get("aprobador_nombre") or "", aprobador_email=e.get("aprobador_email"),
                              suplente_user_id=e.get("suplente_user_id"), suplente_nombre=e.get("suplente_nombre"), suplente_email=e.get("suplente_email"), status=e["status"], nota=e.get("nota") or None))
    bitacora(db, inst.id, "grupo_resuelto", user, {"grupo": g.get("nombre"), "via": r["via"], "nota": "Reprocesado tras corregir la configuración"})
    await db.flush()
    return await avanzar(db, inst)


# ── Serializacion para las rutas ──────────────────────────────────────────

def serializar_etapa(e: InstanciaEtapa) -> Dict[str, Any]:
    return {"id": e.id, "orden": e.orden, "nombre": e.nombre, "tipo": e.tipo, "puesto_esperado": e.puesto_esperado, "condicion": e.condicion,
            "aprobador_user_id": e.aprobador_user_id, "aprobador_nombre": e.aprobador_nombre, "aprobador_email": e.aprobador_email,
            "suplente_user_id": e.suplente_user_id, "suplente_nombre": e.suplente_nombre, "status": e.status, "nota": e.nota,
            "decidio_user_id": e.decidio_user_id, "decidio_nombre": e.decidio_nombre, "decidio_id_externo": e.decidio_id_externo,
            "decidio_en": e.decidio_en.isoformat() if e.decidio_en else None, "comentario": e.comentario,
            "en_turno_desde": e.en_turno_desde.isoformat() if e.en_turno_desde else None}


def serializar_instancia(inst: Instancia, etapas: Optional[List[InstanciaEtapa]] = None, conexion: Optional[Conexion] = None, flujo_nombre: Optional[str] = None) -> Dict[str, Any]:
    d = {"id": inst.id, "folio": inst.folio, "flujo_id": inst.flujo_id, "flujo_nombre": flujo_nombre, "process_id": inst.process_id, "result_service": inst.result_service,
         "conexion_id": inst.conexion_id, "conexion_titulo": conexion.titulo if conexion else None, "conexion_slug": conexion.slug if conexion else None,
         "external_key": inst.external_key, "company_group": inst.company_group, "tenant_id": inst.tenant_id, "company_name": inst.company_name, "origen_clave": inst.origen_clave,
         "requester": {"id": inst.requester_id_externo, "login": inst.requester_login, "user_id": inst.requester_user_id, "name": inst.requester_nombre, "email": inst.requester_email},
         "card_data": inst.card_data, "grupo_nombre": inst.grupo_nombre, "status": inst.status, "etapa_actual": inst.etapa_actual, "approved": inst.approved,
         "decidida_en": inst.decidida_en.isoformat() if inst.decidida_en else None, "afectacion": inst.afectacion,
         "afectada_en": inst.afectada_en.isoformat() if inst.afectada_en else None, "mensaje_plataforma": inst.mensaje_plataforma,
         "sustituida_por_id": inst.sustituida_por_id, "created_at": inst.created_at.isoformat() if inst.created_at else None,
         "updated_at": inst.updated_at.isoformat() if inst.updated_at else None}
    if etapas is not None:
        d["etapas"] = [serializar_etapa(e) for e in etapas]
    return d
