import httpx
"""Formulario del solicitante: formatos disponibles, datos para llenar el formato y
vista previa ya llena. El envio (ticket, PDF y firma) llega en el siguiente paso."""
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.mesa_de_soporte import AccCuenta, AccFormato, AccSolicitud, Incident, IncidentAttachment, TicketSeverity, TicketSystem
from app.routes.control_cambios.control_cambios import _subir_archivo
from shared.middleware.jwt_validator import get_token_from_request
from app.routes.control_accesos.configuracion import _config_completa, _formato
from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update, _generate_folio, _get_requester_profile, get_current_user
from app.services.control_accesos.motor.documento import contexto_solicitud, html_a_pdf, ordenar_familias, renderizar

router = APIRouter(prefix="/control-accesos")
FOLIO_PREVIO = "ACC-XXXX-000000"


def _uid(user: dict) -> str:
    return str(user.get("user_id") or user.get("sub") or user.get("id"))


async def _movimiento(db: AsyncSession, formato_id: str, user_id: str) -> tuple[str, AccCuenta | None]:
    """Si el usuario ya tiene cuenta vigente en ese sistema, su solicitud es una Modificacion."""
    cuenta = (await db.execute(select(AccCuenta).where(AccCuenta.formato_id == formato_id, AccCuenta.usuario_id == user_id))).scalar_one_or_none()
    return ("modificacion", cuenta) if cuenta and cuenta.estado != "baja" else ("alta", cuenta)


async def _usuario(user: dict) -> dict:
    p = await _get_requester_profile(_uid(user))
    return {"nombre": (p.get("full_name") or "").upper(), "matricula": p.get("matricula") or "", "puesto": (p.get("puesto") or "").upper(),
            "departamento": (p.get("departamento") or "").upper(), "empresa": p.get("company_razon_social") or p.get("company_name") or "",
            "grupo": p.get("family_name") or "", "correo": p.get("email") or ""}


async def _ajustes_firma(db: AsyncSession) -> tuple[str, bool]:
    ajustes = dict((await db.execute(text("SELECT key, value FROM incidencias_settings WHERE key LIKE 'acc.%'"))).all())
    metodo = ajustes.get("acc.metodo_firma", "manual")
    return metodo, metodo == "docusign" and ajustes.get("acc.docusign_ambiente", "pruebas") == "pruebas"


async def _formato_activo(db: AsyncSession, formato_id: str) -> AccFormato:
    f = await _formato(db, formato_id)
    if not f.activo:
        raise HTTPException(status_code=404, detail="Este formato no está disponible")
    return f


@router.get("/formatos")
async def formatos_disponibles(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    filas = (await db.execute(
        select(AccFormato, TicketSystem.name).join(TicketSystem, TicketSystem.id == AccFormato.system_id)
        .where(AccFormato.activo == True).order_by(AccFormato.orden, AccFormato.nombre)
    )).all()
    res = []
    for f, sistema in filas:
        movimiento, _ = await _movimiento(db, f.id, _uid(user))
        res.append({"id": f.id, "nombre": f.nombre, "sistema": sistema, "movimiento": movimiento})
    return res


@router.get("/formatos/{formato_id}/formulario")
async def formulario(formato_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    f = await _formato_activo(db, formato_id)
    config = await _config_completa(db, f)
    catalogo = {c["id"]: c for c in config["catalogo_empresas"]}
    familias: dict[str, dict] = {}
    for cid in config["empresas_elegidas"]:
        c = catalogo.get(cid)
        if not c or not c.get("operando"):
            continue
        fam = c.get("familia") or {}
        fid = fam.get("id") or "__sin__"
        familias.setdefault(fid, {"id": fid, "nombre": fam.get("nombre") or "SIN FAMILIA", "empresas": []})["empresas"].append(
            {"id": c["id"], "nombre": c["nombre_comercial"], "razon_social": c["razon_social"]})
    movimiento, cuenta = await _movimiento(db, f.id, _uid(user))
    return {
        "formato": {"id": f.id, "nombre": f.nombre, "sistema": config["formato"]["sistema"]},
        "usuario": await _usuario(user),
        "movimiento": movimiento,
        "familias": ordenar_familias(list(familias.values()), f.presentacion or {}),
        "modulos": [{"id": m["id"], "nombre": m["nombre"], "exclusivo_admin": m["exclusivo_admin"],
                     "perfiles": [p["nombre"] for p in m["perfiles"]], "rutinas": [r["nombre"] for r in m["rutinas"] if r["activo"]]}
                    for m in config["modulos"] if m["activo"]],
        "previos": (cuenta.accesos or None) if movimiento == "modificacion" and cuenta else None,
    }


@router.post("/formatos/{formato_id}/vista-previa", response_class=HTMLResponse)
async def vista_previa_solicitud(formato_id: str, datos: dict = Body(...), db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    f = await _formato_activo(db, formato_id)
    config = await _config_completa(db, f)
    movimiento, _ = await _movimiento(db, f.id, _uid(user))
    metodo, prueba = await _ajustes_firma(db)
    fecha = datetime.now(ZoneInfo("America/Monterrey")).strftime("%d/%m/%Y")
    ctx = contexto_solicitud(config, datos, await _usuario(user), movimiento, FOLIO_PREVIO, fecha, metodo, prueba)
    return HTMLResponse(renderizar(f.clave, ctx))


# ── Envío: crea el ticket de acceso y guarda la solicitud (la firma llega después de la revisión) ──
import uuid
from datetime import date, timedelta, timezone

from app.services.sla import limites_sla


def _validar(datos: dict, config: dict) -> list[str]:
    """Revalida en el servidor todo lo que el formulario ya valido."""
    errores = []
    jefe = datos.get("jefe") or {}
    if not (jefe.get("nombre") or "").strip():
        errores.append("el nombre del jefe directo")
    correo = (jefe.get("correo") or "").strip()
    if "@" not in correo or "." not in correo.split("@")[-1]:
        errores.append("un correo válido del jefe directo")
    tipo = datos.get("tipo") or {}
    if tipo.get("motivo") not in ("alta_nueva", "reemplazo", "migracion"):
        errores.append("el tipo de solicitud")
    if tipo.get("motivo") == "reemplazo" and not (tipo.get("reemplaza_a") or "").strip():
        errores.append("a quién reemplaza")
    validas = {c["id"] for c in config["catalogo_empresas"] if c.get("operando")} & set(config["empresas_elegidas"])
    empresas = datos.get("empresas") or []
    if not empresas or any(e not in validas for e in empresas):
        errores.append("empresas válidas del formato")
    modulos = {m["id"]: m for m in config["modulos"] if m["activo"]}
    elegidos = datos.get("modulos") or []
    if not elegidos:
        errores.append("al menos un módulo")
    for m in elegidos:
        mod = modulos.get(m.get("modulo_id"))
        if not mod:
            errores.append("módulos válidos del formato")
            continue
        if m.get("perfil") not in [p["nombre"] for p in mod["perfiles"]]:
            errores.append(f"un perfil válido para {mod['nombre']}")
        rutinas = m.get("rutinas") or []
        if not rutinas or any(not (r or "").strip() or "|" in r for r in rutinas):
            errores.append(f"rutinas válidas para {mod['nombre']}")
    vig = datos.get("vigencia") or {}
    if vig.get("tipo") not in ("permanente", "temporal"):
        errores.append("la vigencia")
    if vig.get("tipo") == "temporal":
        try:
            if date.fromisoformat(vig.get("hasta") or "") <= date.today():
                errores.append("una fecha de vigencia posterior a hoy")
        except ValueError:
            errores.append("una fecha de vigencia válida")
    if datos.get("acepta") is not True:
        errores.append("aceptar la declaración de responsabilidad")
    return errores


def _descripcion(datos: dict, config: dict, movimiento: str, formato: str) -> str:
    """Resumen en texto, para leerlo desde la tabla y la búsqueda sin abrir la solicitud."""
    nombres = {c["id"]: c["nombre_comercial"] for c in config["catalogo_empresas"]}
    modulos = {m["id"]: m["nombre"] for m in config["modulos"]}
    tipo = datos["tipo"]
    motivo = {"alta_nueva": "Alta nueva", "reemplazo": "Reemplazo", "migracion": "Migración"}[tipo["motivo"]]
    lineas = [f"Solicitud de {'modificación' if movimiento == 'modificacion' else 'alta'} de usuario en {formato}.",
              f"Tipo: {motivo}" + (" · Auditoría (visor)" if tipo.get("auditoria") else "")
              + (f" · Reemplaza a: {tipo['reemplaza_a']}" if tipo.get("reemplaza_a") else "")
              + (f" · Usuario modelo: {tipo['usuario_modelo']}" if tipo.get("usuario_modelo") else ""),
              "Empresas: " + ", ".join(nombres.get(e, e) for e in datos["empresas"]),
              "Módulos:"]
    for m in datos["modulos"]:
        lineas.append(f"  - {modulos.get(m['modulo_id'], '')} ({m['perfil']}): " + " | ".join(m["rutinas"]))
    vig = datos["vigencia"]
    lineas.append("Vigencia: " + ("Permanente" if vig["tipo"] == "permanente" else f"Temporal hasta {vig['hasta']}"))
    if (vig.get("observaciones") or "").strip():
        lineas.append(f"Observaciones: {vig['observaciones'].strip()}")
    lineas.append(f"Jefe directo: {datos['jefe']['nombre'].strip()} <{datos['jefe']['correo'].strip()}>")
    return "\n".join(lineas)


@router.post("/formatos/{formato_id}/solicitudes")
async def enviar_solicitud(formato_id: str, datos: dict = Body(...), db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user),
                           raw_token: str = Depends(get_token_from_request)):
    f = await _formato_activo(db, formato_id)
    config = await _config_completa(db, f)
    errores = _validar(datos, config)
    if errores:
        raise HTTPException(status_code=422, detail="Falta o no es válido: " + ", ".join(dict.fromkeys(errores)))

    user_id = _uid(user)
    company_id = (user.get("companies") or [None])[0]
    if not company_id:
        raise HTTPException(status_code=400, detail="Tu usuario no tiene empresa asignada")
    perfil = await _get_requester_profile(user_id)
    usuario = await _usuario(user)
    movimiento, cuenta = await _movimiento(db, f.id, user_id)
    folio = await _generate_folio(db, "ACC", perfil.get("family_clave"))
    now = datetime.now(timezone.utc)
    # SLA: el de la severidad más alta de incidentes (S1)
    s1 = (await db.execute(select(TicketSeverity).where(TicketSeverity.code == "S1"))).scalar_one_or_none()

    # Directo al encargado de TI del formato; si no hay encargado, al backlog y lo asigna el motor
    con_encargado = bool(f.admin_user_id)
    incident = Incident(
        id=str(uuid.uuid4()), folio=folio, ticket_type="solicitud_acceso",
        title=f"{'Modificación' if movimiento == 'modificacion' else 'Alta'} de usuario · {f.nombre}"[:150],
        company_id=company_id, requester_id=user_id,
        requester_name=perfil.get("full_name", ""), requester_phone=perfil.get("phone"),
        requester_puesto=perfil.get("puesto"), requester_area=perfil.get("departamento"),
        requester_company_name=perfil.get("company_name", ""),
        system_id=f.system_id, module_id=None, reported_type=None,
        description=_descripcion(datos, config, movimiento, f.nombre),
        severity_reported_id=f.severity_id, severity_validated_id=f.severity_id,
        assigned_to_user_id=f.admin_user_id if con_encargado else None,
        assigned_at=now if con_encargado else None,
        status="en_revision" if con_encargado else "en_backlog",
        sla_response_limit=limites_sla(s1, now)[0] if s1 else None,
        sla_resolution_limit=limites_sla(s1, now)[1] if s1 else None,
        created_at=now,
    )
    db.add(incident)
    await db.flush()

    if not cuenta:
        cuenta = AccCuenta(formato_id=f.id, usuario_id=user_id, usuario_nombre=perfil.get("full_name", ""), estado="pendiente", accesos={})
        db.add(cuenta)
        await db.flush()

    # Copia completa: el documento que se firme será idéntico al que vio el solicitante
    datos_limpios = {k: datos[k] for k in ("jefe", "tipo", "empresas", "modulos", "vigencia", "acepta") if k in datos}
    solicitud = AccSolicitud(
        incident_id=incident.id, formato_id=f.id, cuenta_id=cuenta.id, movimiento=movimiento,
        datos={"captura": datos_limpios, "usuario": usuario, "config": config, "enviado_en": now.isoformat()},
        created_at=now,
    )
    db.add(solicitud)

    # El PDF de la solicitud, como evidencia del ticket. Si falla, el ticket se crea igual.
    await _adjuntar_pdf(db, incident, solicitud, perfil.get("company_slug"), raw_token)

    await db.commit()

    await _broadcast_ticket_update(incident, event_type="it_service_desk.ticket_created")
    await _avisar_ti_nueva(incident, f, solicitud, usuario)
    if not con_encargado:
        try:
            from app.rabbitmq import publish_incident_created
            await publish_incident_created(str(incident.id))
        except Exception:
            pass   # se queda en backlog para asignación manual; no se pierde nada

    return {"success": True, "message": "Solicitud enviada",
            "data": {"id": incident.id, "folio": folio, "status": incident.status, "movimiento": movimiento,
                     "asignado_a": f.admin_nombre if con_encargado else None}}



# ── Resumen por secciones para el panel del ticket ──────────────────────────
@router.get("/solicitudes/{incident_id}/resumen")
async def resumen_solicitud(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    fila = (await db.execute(select(AccSolicitud, Incident).join(Incident, Incident.id == AccSolicitud.incident_id)
                             .where(AccSolicitud.incident_id == incident_id))).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    sol, inc = fila
    uid = _uid(user)
    roles = set(user.get("roles") or [])
    if uid not in (inc.requester_id, inc.assigned_to_user_id) and not roles & {"it-service-desk:incident-manager", "super_admin"} and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")
    cap = sol.datos.get("captura", {})
    config = sol.datos.get("config", {})
    catalogo = {c["id"]: c for c in config.get("catalogo_empresas", [])}
    familias: dict[str, dict] = {}
    for cid in cap.get("empresas", []):
        c = catalogo.get(cid) or {}
        fam = c.get("familia") or {}
        fid = fam.get("id") or "__sin__"
        familias.setdefault(fid, {"id": fid, "nombre": fam.get("nombre") or "SIN FAMILIA", "empresas": []})["empresas"].append(c.get("nombre_comercial") or cid)
    modulos = {m["id"]: m for m in config.get("modulos", [])}
    tipo = cap.get("tipo", {})
    vig = cap.get("vigencia", {})
    hasta = vig.get("hasta") or ""
    return {
        "movimiento": sol.movimiento,
        "tipo": {"motivo": {"alta_nueva": "Alta nueva", "reemplazo": "Reemplazo", "migracion": "Migración"}.get(tipo.get("motivo"), "—"),
                 "auditoria": bool(tipo.get("auditoria")), "usuario_modelo": tipo.get("usuario_modelo") or "", "reemplaza_a": tipo.get("reemplaza_a") or ""},
        "familias": ordenar_familias(list(familias.values()), (config.get("formato") or {}).get("presentacion") or {}),
        "modulos": [{"nombre": (modulos.get(m["modulo_id"]) or {}).get("nombre", ""), "exclusivo_admin": bool((modulos.get(m["modulo_id"]) or {}).get("exclusivo_admin")),
                     "perfil": m.get("perfil", ""), "rutinas": m.get("rutinas", [])} for m in cap.get("modulos", [])],
        "vigencia": "Permanente" if vig.get("tipo") == "permanente" else (f"Temporal hasta {hasta[8:10]}/{hasta[5:7]}/{hasta[0:4]}" if len(hasta) == 10 else "Temporal"),
        "observaciones": vig.get("observaciones") or "",
        "jefe": cap.get("jefe", {}),
        "tiene_pdf": bool(sol.pdf_object_key),
        "estado_firma": sol.estado_firma,
        "revision": (sol.datos or {}).get("revision"),
    }



# ── PDF de la solicitud como evidencia (al enviar, o después con el botón) ──
import logging

log = logging.getLogger("control_accesos")


async def _adjuntar_pdf(db: AsyncSession, incident: Incident, solicitud: AccSolicitud, company_slug: str, raw_token: str) -> bool:
    """Genera el PDF con la copia guardada de la solicitud y lo adjunta al ticket. Nunca lanza error."""
    try:
        f = await _formato(db, solicitud.formato_id)
        snap = solicitud.datos or {}
        metodo, prueba = await _ajustes_firma(db)
        enviado = snap.get("enviado_en")
        cuando = datetime.fromisoformat(enviado) if enviado else datetime.now(timezone.utc)
        fecha = cuando.astimezone(ZoneInfo("America/Monterrey")).strftime("%d/%m/%Y")
        html = renderizar(f.clave, contexto_solicitud(snap["config"], snap["captura"], snap["usuario"], solicitud.movimiento,
                                                      incident.folio, fecha, metodo, prueba))
        pdf = await html_a_pdf(html)
        solicitud._pdf_bytes = pdf   # para adjuntarlo en el correo a TI
        nombre = f"SOLICITUD_{incident.folio}_{cuando.astimezone(ZoneInfo('America/Monterrey')).strftime('%Y%m%d_%H%M%S')}.pdf"
        key = await _subir_archivo(pdf, nombre, "application/pdf", company_slug, f"control-de-accesos/{incident.folio}", raw_token)
        if not key:
            log.warning("El upload-service no aceptó el PDF de %s (empresa %s)", incident.folio, company_slug)
            return False
        solicitud.pdf_object_key = key
        db.add(IncidentAttachment(incident_id=incident.id, attachment_type="evidencia_reporte", object_key=key,
                                  mime_type="application/pdf", size_bytes=len(pdf), uploaded_by=incident.requester_id))
        return True
    except Exception as e:
        log.warning("No se pudo generar o adjuntar el PDF de %s: %s", incident.folio, e)
        return False


@router.post("/solicitudes/{incident_id}/pdf")
async def generar_pdf_solicitud(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user),
                                raw_token: str = Depends(get_token_from_request)):
    fila = (await db.execute(select(AccSolicitud, Incident).join(Incident, Incident.id == AccSolicitud.incident_id)
                             .where(AccSolicitud.incident_id == incident_id))).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    sol, inc = fila
    uid, roles = _uid(user), set(user.get("roles") or [])
    if uid not in (inc.requester_id, inc.assigned_to_user_id) and not roles & {"it-service-desk:incident-manager", "super_admin"} and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")
    if sol.pdf_object_key:
        return {"success": True, "ya_existia": True}
    perfil = await _get_requester_profile(inc.requester_id)
    if not await _adjuntar_pdf(db, inc, sol, perfil.get("company_slug"), raw_token):
        raise HTTPException(status_code=502, detail="No se pudo generar o adjuntar el PDF. Revisa el registro del servicio.")
    await db.commit()
    return {"success": True}



# ── Revisión de TI: aprobar (manda a firma) o rechazar ──────────────────────
from pydantic import BaseModel as _BM


class AprobarPayload(_BM):
    jefe_admin_nombre: str = ""
    jefe_admin_correo: str = ""


class RechazarPayload(_BM):
    motivo: str


async def _revision(db: AsyncSession, incident_id: str, user: dict):
    fila = (await db.execute(select(AccSolicitud, Incident).join(Incident, Incident.id == AccSolicitud.incident_id)
                             .where(AccSolicitud.incident_id == incident_id))).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    sol, inc = fila
    f = await _formato(db, sol.formato_id)
    uid, roles = _uid(user), set(user.get("roles") or [])
    es_im = bool(roles & {"it-service-desk:incident-manager", "super_admin"}) or bool(user.get("is_super_admin"))
    if not (es_im or uid in (str(f.admin_user_id or ""), str(inc.assigned_to_user_id or ""))):
        raise HTTPException(status_code=403, detail="Solo el encargado de TI del formato o un Incident Manager revisan esta solicitud")
    if inc.status != "en_revision":
        raise HTTPException(status_code=422, detail="La solicitud ya no está en revisión")
    return sol, inc, f, uid


async def _avisar_solicitante(inc: Incident, asunto: str, mensaje: str, campos: list[dict], tipo: str = "info"):
    from app.assignment import _notify_inapp
    try:
        perfil = await _get_requester_profile(inc.requester_id)
        if perfil.get("email"):
            async with httpx.AsyncClient(timeout=8.0) as cli:
                await cli.post("http://email-service:8000/api/v1/email/system-notification", json={
                    "to_email": perfil["email"], "full_name": inc.requester_name, "subject": asunto, "message": mensaje,
                    "alert_type": tipo, "fields": [{"label": "Folio", "value": inc.folio, "mono": True}] + campos})
    except Exception as e:
        log.warning("No se pudo avisar al solicitante de %s: %s", inc.folio, e)
    if inc.requester_id:
        await _notify_inapp(inc.requester_id, asunto, mensaje, tipo, {"incident_id": str(inc.id), "folio": inc.folio})


def _bitacora(db, inc, uid, user, accion, detalle):
    from app.models.mesa_de_soporte import IncidentActivityLog
    db.add(IncidentActivityLog(incident_id=inc.id, action=accion, performed_by=uid, performed_by_name=user.get("full_name") or "—",
                               performed_by_role="ti", performed_at=datetime.now(timezone.utc), company_id=inc.company_id,
                               module_slug="it-service-desk", detail=detalle))


@router.post("/solicitudes/{incident_id}/aprobar")
async def aprobar_solicitud(incident_id: str, body: AprobarPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """TI aprueba: se genera el formato con anclas y se manda el sobre de DocuSign."""
    from app.config import config as _cfg
    from app.services.control_accesos.firma import docusign as ds
    sol, inc, f, uid = await _revision(db, incident_id, user)
    metodo, prueba = await _ajustes_firma(db)
    if metodo == "manual":
        return await _aprobar_manual(db, sol, inc, f, uid, user, body)
    if metodo != "docusign":
        raise HTTPException(status_code=422, detail=f"Método de firma desconocido: {metodo}")
    if not ds.configurado():
        raise HTTPException(status_code=503, detail="DocuSign no está configurado en el servidor")
    con_admin = bool(body.jefe_admin_nombre.strip() or body.jefe_admin_correo.strip())
    if con_admin and ("@" not in body.jefe_admin_correo or not body.jefe_admin_nombre.strip()):
        raise HTTPException(status_code=422, detail="Escribe el nombre y un correo válido del jefe administrativo")

    snap = sol.datos or {}
    cap, usr = snap.get("captura", {}), snap.get("usuario", {})
    jefe = cap.get("jefe", {})
    ti = await _get_requester_profile(f.admin_user_id) if f.admin_user_id else {}
    if not ti.get("email"):
        raise HTTPException(status_code=422, detail="El formato no tiene un encargado de TI con correo")
    if not usr.get("correo") or not jefe.get("correo"):
        raise HTTPException(status_code=422, detail="Faltan los correos del usuario o del jefe directo en la solicitud")

    enviado = datetime.fromisoformat(snap["enviado_en"]) if snap.get("enviado_en") else datetime.now(timezone.utc)
    fecha = enviado.astimezone(ZoneInfo("America/Monterrey")).strftime("%d/%m/%Y")
    ctx = contexto_solicitud(snap["config"], cap, usr, sol.movimiento, inc.folio, fecha, metodo, prueba,
                             con_admin=con_admin, jefe_admin_nombre=body.jefe_admin_nombre.strip(), anclas=True)
    pdf = await html_a_pdf(renderizar(f.clave, ctx))

    firmantes = [{"name": usr.get("nombre") or inc.requester_name, "email": usr["correo"], "firma_ancla": "/f1/"},
                 {"name": jefe.get("nombre"), "email": jefe["correo"].strip(), "firma_ancla": "/f2/"}]
    if con_admin:
        firmantes.append({"name": body.jefe_admin_nombre.strip(), "email": body.jefe_admin_correo.strip(), "firma_ancla": "/f3/"})
    firmantes.append({"name": ti.get("full_name") or f.admin_nombre or "TI", "email": ti["email"], "firma_ancla": "/f4/",
                      "fecha_ancla": "/fa/", "textos": [{"etiqueta": "usuario_asignado", "ancla": "/ua/", "obligatorio": True, "ancho": 150}]})
    for n, x in enumerate(firmantes, start=1):
        x["routing_order"] = n

    webhook = f"{_cfg.FRONTEND_URL.rstrip('/')}/api/v1/it-service-desk/control-accesos/docusign/webhook"
    try:
        envelope_id = await ds.crear_sobre(pdf, inc.folio, f"Firma de solicitud de acceso {inc.folio} · {f.nombre}",
                                           f"Solicitud de {sol.movimiento} de usuario en {f.nombre} para {usr.get('nombre', '')}. "
                                           "Revísala y fírmala; al final TI asignará el usuario.", firmantes, webhook)
    except Exception as e:
        log.warning("DocuSign rechazó el sobre de %s: %s", inc.folio, e)
        raise HTTPException(status_code=502, detail="DocuSign no aceptó el sobre. Revisa el registro del servicio.")

    sol.docusign_envelope_id, sol.metodo_firma, sol.estado_firma = envelope_id, "docusign", "enviado"
    sol.datos = {**snap, "revision": {"aprobada_por": user.get("full_name"), "aprobada_en": datetime.now(timezone.utc).isoformat(),
                                      "jefe_admin": {"nombre": body.jefe_admin_nombre.strip(), "correo": body.jefe_admin_correo.strip()} if con_admin else None}}
    inc.status = "en_firma"
    _bitacora(db, inc, uid, user, "aprobada_enviada_a_firma",
              {"firmantes": [x["name"] for x in firmantes], "jefe_administrativo": con_admin, "sobre": envelope_id})
    await db.commit()
    await db.refresh(inc)
    await _broadcast_ticket_update(inc)
    orden = " → ".join(["tú", "tu jefe directo"] + (["el jefe administrativo"] if con_admin else []) + ["TI"])
    await _avisar_solicitante(inc, f"Tu solicitud {inc.folio} fue aprobada",
                              f"TI aprobó tu solicitud. Te llegará un correo de DocuSign para firmarla. Orden de firma: {orden}.",
                              [{"label": "Formato", "value": f.nombre, "mono": False}], "success")
    return {"success": True, "status": inc.status, "envelope_id": envelope_id, "firmantes": [x["name"] for x in firmantes]}


@router.post("/solicitudes/{incident_id}/rechazar")
async def rechazar_solicitud(incident_id: str, body: RechazarPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """TI rechaza: el ticket termina como Rechazado, con su motivo."""
    motivo = (body.motivo or "").strip()
    if len(motivo) < 5:
        raise HTTPException(status_code=422, detail="Escribe el motivo del rechazo")
    sol, inc, f, uid = await _revision(db, incident_id, user)
    ahora = datetime.now(timezone.utc)
    sol.estado_firma = "rechazada"
    sol.datos = {**(sol.datos or {}), "revision": {"rechazada_por": user.get("full_name"), "rechazada_en": ahora.isoformat(), "motivo": motivo}}
    inc.status, inc.closed_at = "rechazado", ahora
    _bitacora(db, inc, uid, user, "solicitud_rechazada", {"motivo": motivo})
    await db.commit()
    await db.refresh(inc)
    await _broadcast_ticket_update(inc)
    await _avisar_solicitante(inc, f"Tu solicitud {inc.folio} fue rechazada",
                              f"TI rechazó tu solicitud. Motivo: {motivo}. Si aún necesitas el acceso, levanta una solicitud nueva con los ajustes.",
                              [{"label": "Formato", "value": f.nombre, "mono": False}], "warning")
    return {"success": True, "status": inc.status}



# ── DocuSign: webhook y consulta de respaldo ────────────────────────────────
from fastapi import Request as _Request


async def _procesar(db, envelope_id: str) -> dict:
    from app.services.control_accesos.firma.cierre import procesar_sobre
    return await procesar_sobre(db, envelope_id, _avisar_solicitante, _get_requester_profile, _broadcast_ticket_update)


@router.post("/docusign/webhook")
async def docusign_webhook(request: _Request, db: AsyncSession = Depends(get_db)):
    """Aviso de DocuSign para los sobres del Control de accesos. Solo procesa sobres propios;
    responde 200 siempre que el aviso sea legible, para que DocuSign no reintente sin fin."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")
    data = payload.get("data") or {}
    envelope_id = data.get("envelopeId") or payload.get("envelopeId")
    if not envelope_id:
        return {"received": True, "accion": "ignorado"}
    try:
        return {"received": True, **(await _procesar(db, envelope_id))}
    except Exception as e:
        log.warning("Webhook de DocuSign: no se pudo procesar el sobre %s: %s", envelope_id, e)
        return {"received": True, "accion": "error"}


@router.post("/internal/docusign-poll")
async def docusign_poll(request: _Request, db: AsyncSession = Depends(get_db)):
    """Respaldo: revisa los sobres en firma. Solo desde dentro del contenedor."""
    if (request.client.host if request.client else "") not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Solo uso interno")
    ids = (await db.execute(select(AccSolicitud.docusign_envelope_id).join(Incident, Incident.id == AccSolicitud.incident_id)
                            .where(Incident.status == "en_firma", AccSolicitud.docusign_envelope_id.isnot(None)))).scalars().all()
    resultados = []
    for envelope_id in ids:
        try:
            resultados.append(await _procesar(db, envelope_id))
        except Exception as e:
            log.warning("Consulta de DocuSign: falló el sobre %s: %s", envelope_id, e)
            resultados.append({"accion": "error", "sobre": envelope_id[:8]})
    return {"revisados": len(ids), "resultados": resultados}



# ══ Firma manual: liga para subir el escaneo y liberación con la firma de TI ══
import base64 as _b64
import hashlib as _hashlib
import secrets as _secrets
from datetime import timedelta as _td
from typing import List as _List
from fastapi import File as _File, UploadFile as _UploadFile
from app.services.control_accesos.firma import almacen as _almacen

DIAS_LIGA = 15
TZ_MTY_ACC = ZoneInfo("America/Monterrey")


def _url_frontend() -> str:
    from app.config import config as _cfg
    return _cfg.FRONTEND_URL.rstrip("/")


async def _correo(to_email: str, nombre: str, asunto: str, mensaje: str, campos: list, adjuntos: list | None = None,
                  boton: tuple[str, str] | None = None, tipo: str = "info") -> None:
    try:
        cuerpo = {"to_email": to_email, "full_name": nombre, "subject": asunto, "message": mensaje, "alert_type": tipo, "fields": campos}
        if boton:
            cuerpo.update(action_label=boton[0], action_url=boton[1])
        if adjuntos:
            cuerpo["attachments"] = [{"filename": n, "content_base64": _b64.b64encode(d).decode(), "subtype": "pdf"} for n, d in adjuntos]
        async with httpx.AsyncClient(timeout=20.0) as cli:
            await cli.post("http://email-service:8000/api/v1/email/system-notification", json=cuerpo)
    except Exception as e:
        log.warning("No se pudo mandar el correo '%s' a %s: %s", asunto, to_email, e)


async def _avisar_ti_nueva(inc, f, solicitud, usuario: dict) -> None:
    """Al enviar: al encargado de TI le llega la solicitud con su PDF adjunto."""
    if not f.admin_user_id:
        return
    ti = await _get_requester_profile(f.admin_user_id)
    if not ti.get("email"):
        return
    pdf = getattr(solicitud, "_pdf_bytes", None)
    await _correo(ti["email"], ti.get("full_name", ""), f"Nueva solicitud de acceso {inc.folio} para revisar",
                  f"{usuario.get('nombre', inc.requester_name)} solicitó acceso a {f.nombre}. Revisa el formato adjunto y apruébalo o recházalo en la intranet.",
                  [{"label": "Folio", "value": inc.folio, "mono": True}, {"label": "Solicitante", "value": inc.requester_name, "mono": False},
                   {"label": "Formato", "value": f.nombre, "mono": False}],
                  [(f"SOLICITUD_{inc.folio}.pdf", pdf)] if pdf else None,
                  ("Revisar en la intranet", f"{_url_frontend()}/app/it-service-desk/mesa-de-soporte"))


async def _aprobar_manual(db, sol, inc, f, uid, user, body) -> dict:
    """Aprobación con firma manual: PDF adjunto y liga segura para subir el escaneo firmado."""
    con_admin = bool(body.jefe_admin_nombre.strip() or body.jefe_admin_correo.strip())
    if con_admin and not body.jefe_admin_nombre.strip():
        raise HTTPException(status_code=422, detail="Escribe el nombre del jefe administrativo")
    snap = sol.datos or {}
    cap, usr = snap.get("captura", {}), snap.get("usuario", {})
    enviado = datetime.fromisoformat(snap["enviado_en"]) if snap.get("enviado_en") else datetime.now(timezone.utc)
    ctx = contexto_solicitud(snap["config"], cap, usr, sol.movimiento, inc.folio, enviado.astimezone(TZ_MTY_ACC).strftime("%d/%m/%Y"),
                             "manual", False, con_admin=con_admin, jefe_admin_nombre=body.jefe_admin_nombre.strip())
    pdf = await html_a_pdf(renderizar(f.clave, ctx))
    token = _secrets.token_urlsafe(32)
    ahora = datetime.now(timezone.utc)
    sol.metodo_firma, sol.estado_firma = "manual", "por_firmar"
    sol.datos = {**snap, "revision": {"aprobada_por": user.get("full_name"), "aprobada_en": ahora.isoformat(),
                                      "jefe_admin": {"nombre": body.jefe_admin_nombre.strip(), "correo": body.jefe_admin_correo.strip()} if con_admin else None},
                 "subida": {"token": token, "vence": (ahora + _td(days=DIAS_LIGA)).isoformat()}}
    inc.status = "en_firma"
    _bitacora(db, inc, uid, user, "aprobada_firma_manual", {"jefe_administrativo": con_admin})
    await db.commit()
    await db.refresh(inc)
    await _broadcast_ticket_update(inc)
    firman = ["tú", "tu jefe directo"] + (["el jefe administrativo"] if con_admin else [])
    perfil = await _get_requester_profile(inc.requester_id)
    if perfil.get("email"):
        await _correo(perfil["email"], inc.requester_name, f"Tu solicitud {inc.folio} fue aprobada: recaba las firmas",
                      f"TI aprobó tu solicitud. Imprime el formato adjunto, recaba las firmas de {', '.join(firman[:-1])} y {firman[-1]}, "
                      f"escanéalo y súbelo con el botón (la liga vence en {DIAS_LIGA} días). La firma de TI se agrega al liberar tu acceso.",
                      [{"label": "Folio", "value": inc.folio, "mono": True}, {"label": "Formato", "value": f.nombre, "mono": False}],
                      [(f"SOLICITUD_{inc.folio}.pdf", pdf)], ("Subir documento firmado", f"{_url_frontend()}/subir-firmado/{token}"), "success")
    return {"success": True, "status": inc.status, "metodo": "manual"}


async def _por_token(db, token: str):
    fila = (await db.execute(select(AccSolicitud, Incident).join(Incident, Incident.id == AccSolicitud.incident_id)
                             .where(AccSolicitud.datos["subida"]["token"].astext == token))).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Liga no válida")
    sol, inc = fila
    vence = datetime.fromisoformat((sol.datos or {}).get("subida", {}).get("vence"))
    return sol, inc, vence


@router.get("/subida/{token}")
async def ver_subida(token: str, db: AsyncSession = Depends(get_db)):
    """Página pública de la liga: qué solicitud es y si todavía se puede subir."""
    sol, inc, vence = await _por_token(db, token)
    f = await _formato(db, sol.formato_id)
    rev = (sol.datos or {}).get("revision") or {}
    esc = (sol.datos or {}).get("escaneo")
    puede = inc.status == "en_firma" and sol.estado_firma in ("por_firmar", "por_liberar") and vence > datetime.now(timezone.utc)
    return {"folio": inc.folio, "formato": f.nombre, "solicitante": inc.requester_name, "movimiento": sol.movimiento,
            "firman": ["Usuario", "Jefe directo"] + (["Jefe administrativo"] if rev.get("jefe_admin") else []),
            "puede_subir": puede, "vence": vence.isoformat(), "estado": sol.estado_firma,
            "ya_subido": {"en": esc.get("subido_en"), "kb": esc.get("kb")} if esc else None}


@router.post("/subida/{token}")
async def subir_firmado(token: str, archivos: _List[_UploadFile] = _File(...), db: AsyncSession = Depends(get_db)):
    """El usuario sube el escaneo firmado (PDF o fotos). Se une en un solo PDF y se avisa a TI."""
    from pypdf import PdfReader, PdfWriter
    import io as _io
    sol, inc, vence = await _por_token(db, token)
    if not (inc.status == "en_firma" and sol.estado_firma in ("por_firmar", "por_liberar")):
        raise HTTPException(status_code=410, detail="Esta solicitud ya no recibe documentos")
    if vence <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="La liga venció. Pide a TI que te la vuelva a enviar.")
    if not archivos or len(archivos) > 10:
        raise HTTPException(status_code=422, detail="Sube entre 1 y 10 archivos")
    pdfs, imagenes, total = [], [], 0
    for a in archivos:
        datos = await a.read()
        total += len(datos)
        tipo = (a.content_type or "").lower()
        if tipo == "application/pdf" or datos[:4] == b"%PDF":
            pdfs.append(datos)
        elif tipo in ("image/jpeg", "image/png", "image/webp"):
            imagenes.append((tipo, datos))
        else:
            raise HTTPException(status_code=422, detail=f"{a.filename}: solo se aceptan PDF, JPG o PNG")
    if total > 25 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Los archivos pesan más de 25 MB en total")
    if imagenes:
        paginas = "".join(f'<div class="p"><img src="data:{t};base64,{_b64.b64encode(d).decode()}"></div>' for t, d in imagenes)
        html = ("<!DOCTYPE html><html><head><style>@page{size:A4;margin:0}body{margin:0}"
                ".p{width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;page-break-after:always}"
                ".p img{max-width:200mm;max-height:287mm;object-fit:contain}</style></head><body>" + paginas + "</body></html>")
        pdfs.append(await html_a_pdf(html))
    unido = PdfWriter()
    for d in pdfs:
        for pag in PdfReader(_io.BytesIO(d)).pages:
            unido.add_page(pag)
    buf = _io.BytesIO(); unido.write(buf); escaneo = buf.getvalue()
    ahora = datetime.now(timezone.utc)
    perfil = await _get_requester_profile(inc.requester_id)
    key = f"{perfil.get('company_slug') or 'general'}/control-de-accesos/{inc.folio}/ESCANEO_{inc.folio}_{ahora.astimezone(TZ_MTY_ACC).strftime('%Y%m%d_%H%M%S')}.pdf"
    _almacen.guardar(escaneo, key)
    db.add(IncidentAttachment(incident_id=inc.id, attachment_type="evidencia_reporte", object_key=key, bucket=_almacen.BUCKET,
                              mime_type="application/pdf", size_bytes=len(escaneo), uploaded_by=inc.requester_id))
    sol.estado_firma = "por_liberar"
    sol.datos = {**(sol.datos or {}), "escaneo": {"key": key, "subido_en": ahora.isoformat(), "kb": len(escaneo) // 1024,
                                                   "sha256": _hashlib.sha256(escaneo).hexdigest()}}
    _bitacora(db, inc, inc.requester_id, {"full_name": inc.requester_name}, "documento_firmado_subido", {"kb": len(escaneo) // 1024, "paginas": len(PdfReader(_io.BytesIO(escaneo)).pages)})
    await db.commit()
    await db.refresh(inc)
    await _broadcast_ticket_update(inc)
    f = await _formato(db, sol.formato_id)
    if f.admin_user_id:
        ti = await _get_requester_profile(f.admin_user_id)
        if ti.get("email"):
            await _correo(ti["email"], ti.get("full_name", ""), f"{inc.requester_name} subió el formato firmado de {inc.folio}",
                          "Revisa que estén todas las firmas, captura el usuario asignado y libera el acceso en la intranet.",
                          [{"label": "Folio", "value": inc.folio, "mono": True}], [(f"ESCANEO_{inc.folio}.pdf", escaneo)],
                          ("Revisar y liberar", f"{_url_frontend()}/app/it-service-desk/mesa-de-soporte"))
        from app.assignment import _notify_inapp
        await _notify_inapp(f.admin_user_id, f"Formato firmado de {inc.folio} listo para liberar", inc.requester_name, "info",
                            {"incident_id": str(inc.id), "folio": inc.folio})
    return {"success": True, "estado": sol.estado_firma, "kb": len(escaneo) // 1024}


def _puede_firma(user: dict, f) -> bool:
    roles = set(user.get("roles") or [])
    return bool(roles & {"it-service-desk:incident-manager", "super_admin"}) or bool(user.get("is_super_admin")) \
        or _uid(user) == str(f.admin_user_id or "")


@router.get("/formatos/{formato_id}/firma-ti")
async def ver_firma_ti(formato_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    f = await _formato(db, formato_id)
    if not _puede_firma(user, f):
        raise HTTPException(status_code=403, detail="Solo el encargado de TI del formato")
    fi = (f.presentacion or {}).get("firma_admin")
    if not fi:
        return {"tiene": False}
    datos = _almacen.leer(fi["key"])
    return {"tiene": True, "nombre": fi.get("nombre"), "actualizada": fi.get("actualizada"),
            "imagen": f"data:{fi.get('tipo', 'image/png')};base64,{_b64.b64encode(datos).decode()}"}


@router.post("/formatos/{formato_id}/firma-ti")
async def subir_firma_ti(formato_id: str, archivo: _UploadFile = _File(...), db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    f = await _formato(db, formato_id)
    if not _puede_firma(user, f):
        raise HTTPException(status_code=403, detail="Solo el encargado de TI del formato puede cambiar su firma")
    tipo = (archivo.content_type or "").lower()
    if tipo not in ("image/png", "image/jpeg"):
        raise HTTPException(status_code=422, detail="La firma debe ser PNG (ideal, con fondo transparente) o JPG")
    datos = await archivo.read()
    if len(datos) > 2 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="La imagen pesa más de 2 MB")
    key = f"control-de-accesos/firmas/{f.id}/{_secrets.token_hex(8)}.{'png' if tipo == 'image/png' else 'jpg'}"
    _almacen.guardar(datos, key, tipo)
    f.presentacion = {**(f.presentacion or {}), "firma_admin": {"key": key, "tipo": tipo, "user_id": _uid(user),
                                                                "nombre": user.get("full_name"), "actualizada": datetime.now(timezone.utc).isoformat()}}
    await db.commit()
    return {"success": True}


class LiberarPayload(_BM):
    usuario_asignado: str


@router.post("/solicitudes/{incident_id}/liberar")
async def liberar_solicitud(incident_id: str, body: LiberarPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from pypdf import PdfReader, PdfWriter
    import io as _io
    from app.services.control_accesos.firma.cierre import registrar_cuenta
    usuario_asig = (body.usuario_asignado or "").strip()
    if not usuario_asig:
        raise HTTPException(status_code=422, detail="Captura el usuario asignado")
    fila = (await db.execute(select(AccSolicitud, Incident).join(Incident, Incident.id == AccSolicitud.incident_id)
                             .where(AccSolicitud.incident_id == incident_id))).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    sol, inc = fila
    f = await _formato(db, sol.formato_id)
    if not _puede_firma(user, f):
        raise HTTPException(status_code=403, detail="Solo el encargado de TI del formato libera la solicitud")
    if sol.estado_firma != "por_liberar":
        raise HTTPException(status_code=422, detail="Todavía no se sube el documento firmado")
    fi = (f.presentacion or {}).get("firma_admin")
    if not fi:
        raise HTTPException(status_code=422, detail="Sube tu firma en Actualizaciones → Control de accesos antes de liberar")
    esc = (sol.datos or {}).get("escaneo") or {}
    escaneo = _almacen.leer(esc["key"])
    huella = _hashlib.sha256(escaneo).hexdigest()
    firma = _almacen.leer(fi["key"])
    ahora = datetime.now(timezone.utc)
    local = ahora.astimezone(TZ_MTY_ACC)
    nombre_ti = user.get("full_name") or fi.get("nombre") or "TI"
    e = lambda t: str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    hoja = f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><style>
      @page {{ size: A4; margin: 0 }} * {{ box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }}
      body {{ margin: 0; font: 10.5pt/1.45 Arial, sans-serif; color: #0f172a }}
      .h {{ width: 210mm; height: 297mm; padding: 18mm 18mm 14mm; display: flex; flex-direction: column }}
      h1 {{ margin: 0; font-size: 17pt; color: #1a4fa0 }} .sub {{ color: #64748b; margin-top: 2mm }}
      table {{ width: 100%; border-collapse: collapse; margin-top: 9mm }} td {{ padding: 2.6mm 3mm; border-bottom: 1px solid #e2e8f0 }}
      td:first-child {{ width: 52mm; color: #64748b }} .ua {{ font: 700 14pt monospace; color: #1a4fa0 }}
      .firma {{ margin: 16mm auto 0; width: 92mm; text-align: center }} .firma img {{ max-width: 80mm; max-height: 30mm; display: block; margin: 0 auto -2mm }}
      .linea {{ border-top: 1.2px solid #0f172a; padding-top: 1.6mm; font-weight: 700 }} .rol {{ color: #64748b; font-size: 9pt }}
      .pie {{ margin-top: auto; padding-top: 4mm; border-top: 1px solid #cbd5e1; font-size: 8pt; color: #64748b }}
      .pie code {{ font-size: 7.6pt; color: #334155; word-break: break-all }}
    </style></head><body><div class="h">
      <h1>Liberación de TI</h1><div class="sub">Hoja final del formato de solicitud de acceso · forma parte del documento</div>
      <table>
        <tr><td>Folio</td><td><b>{e(inc.folio)}</b></td></tr>
        <tr><td>Formato</td><td>{e(f.nombre)}</td></tr>
        <tr><td>Solicitante</td><td>{e(inc.requester_name)}</td></tr>
        <tr><td>Movimiento</td><td>{'Modificación' if sol.movimiento == 'modificacion' else 'Alta'} de usuario</td></tr>
        <tr><td>Usuario asignado</td><td class="ua">{e(usuario_asig)}</td></tr>
        <tr><td>Fecha de alta</td><td>{local.strftime('%d/%m/%Y')}</td></tr>
        <tr><td>Liberado</td><td>{local.strftime('%d/%m/%Y %H:%M')} (hora de Monterrey) por {e(nombre_ti)}</td></tr>
      </table>
      <div class="firma"><img src="data:{fi.get('tipo', 'image/png')};base64,{_b64.b64encode(firma).decode()}" alt="Firma">
        <div class="linea">{e(nombre_ti)}</div><div class="rol">Administrador del sistema (TI)</div></div>
      <div class="pie">Esta hoja certifica que TI revisó el formato firmado de las páginas anteriores y liberó el acceso.
        Huella SHA-256 del formato firmado: <code>{huella}</code>. Cualquier cambio a esas páginas cambia la huella.</div>
    </div></body></html>"""
    pagina = await html_a_pdf(hoja)
    final = PdfWriter()
    for d in (escaneo, pagina):
        for pag in PdfReader(_io.BytesIO(d)).pages:
            final.add_page(pag)
    buf = _io.BytesIO(); final.write(buf); documento = buf.getvalue()
    perfil = await _get_requester_profile(inc.requester_id)
    key = f"{perfil.get('company_slug') or 'general'}/control-de-accesos/{inc.folio}/FIRMADO_{inc.folio}_{local.strftime('%Y%m%d_%H%M%S')}.pdf"
    _almacen.guardar(documento, key)
    db.add(IncidentAttachment(incident_id=inc.id, attachment_type="evidencia_resolucion", object_key=key, bucket=_almacen.BUCKET,
                              mime_type="application/pdf", size_bytes=len(documento), uploaded_by=_uid(user)))
    sol.estado_firma, sol.firmado_object_key, sol.usuario_asignado, sol.fecha_alta = "firmado", key, usuario_asig, local.date()
    sol.datos = {**(sol.datos or {}), "liberacion": {"por": nombre_ti, "en": ahora.isoformat(), "huella_escaneo": huella}}
    await registrar_cuenta(db, sol, usuario_asig, inc.folio)
    from app.services.control_accesos.firma.cierre import registrar_en_expediente
    await registrar_en_expediente(db, sol, inc, documento, key, usuario_asig)
    inc.status, inc.resolved_at = "terminado", ahora
    _bitacora(db, inc, _uid(user), user, "liberada_por_ti", {"usuario_asignado": usuario_asig, "huella_escaneo": huella})
    await db.commit()
    await db.refresh(inc)
    await _broadcast_ticket_update(inc)
    if perfil.get("email"):
        await _correo(perfil["email"], inc.requester_name, f"Tu acceso de la solicitud {inc.folio} quedó liberado",
                      f"TI liberó tu acceso. Tu usuario asignado es {usuario_asig}. Te adjuntamos el formato con todas las firmas.",
                      [{"label": "Usuario asignado", "value": usuario_asig, "mono": True}],
                      [(f"FIRMADO_{inc.folio}.pdf", documento)], None, "success")
    return {"success": True, "status": inc.status, "usuario_asignado": usuario_asig}
