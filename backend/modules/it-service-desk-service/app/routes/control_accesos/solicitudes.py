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
