"""Motor · avisos (campana, correo con liga, tiempo real).

Todos son "mejor esfuerzo" y van DESPUES del commit: un correo que falla nunca
deja un tramite a medias. Cada correo queda en correos_enviados (para el
"no me llego") y cada aviso en bitacora. Que correos se mandan lo deciden
los ajustes del modulo (Ajustes → Correos), leidos en el momento de enviar.
"""
import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.models import SYSTEM_ACTOR_ID, Bitacora, CorreoEnviado, Flujo, Instancia, InstanciaEtapa
from app.motor.instancias import ahora, bitacora
from app.services.ajustes import ajustes_service

logger = logging.getLogger("avalanz")


# ── Transporte ────────────────────────────────────────────────────────────

async def campana(user_id: Optional[str], titulo: str, cuerpo: str, tipo: str, data: Dict[str, Any]) -> None:
    if not user_id:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"{config.NOTIFY_SERVICE_URL}/api/v1/notifications/", json={"user_id": user_id, "type": tipo, "title": titulo, "body": cuerpo, "data": data})
    except Exception:
        logger.warning("No se pudo mandar la campana a %s", user_id)


async def correo(db: AsyncSession, inst: Instancia, plantilla: str, email: Optional[str], nombre: str, user_id: Optional[str],
                 asunto: str, html: str, etapa_id: Optional[str] = None, reenvio_de: Optional[str] = None, por: Optional[Dict[str, Any]] = None) -> Optional[CorreoEnviado]:
    """Manda por email-service y registra el resultado. Si no hay correo, registra que no se pudo."""
    if not email:
        db.add(CorreoEnviado(instancia_id=inst.id, etapa_id=etapa_id, plantilla=plantilla, destinatario_email="(sin correo)", destinatario_user_id=user_id,
                             destinatario_nombre=nombre, resultado="no enviado: el usuario no tiene correo", reenvio_de_id=reenvio_de,
                             enviado_por=(por or {}).get("user_id") or SYSTEM_ACTOR_ID, enviado_por_nombre=(por or {}).get("full_name") or "Sistema"))
        return None
    resultado = "aceptado por el servidor"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(f"{config.EMAIL_SERVICE_URL}/api/v1/email/module", json={"to_email": email, "full_name": nombre, "subject": asunto, "html_content": html})
        if r.status_code >= 300:
            resultado = f"rechazado por email-service (HTTP {r.status_code})"
    except Exception as e:
        resultado = f"error al enviar: {type(e).__name__}"
    c = CorreoEnviado(instancia_id=inst.id, etapa_id=etapa_id, plantilla=plantilla, destinatario_email=email, destinatario_user_id=user_id, destinatario_nombre=nombre,
                      resultado=resultado, reenvio_de_id=reenvio_de, enviado_por=(por or {}).get("user_id") or SYSTEM_ACTOR_ID, enviado_por_nombre=(por or {}).get("full_name") or "Sistema")
    db.add(c)
    return c


# ── Plantillas (HTML que va dentro de la plantilla corporativa del email-service) ──

def _fmt(n: Any) -> str:
    try:
        return f"${float(n):,.2f}"
    except (TypeError, ValueError):
        return str(n or "")


async def _hoja_html(db: AsyncSession, inst: Instancia) -> str:
    """Resumen corto para el correo (plantilla corporativa). La hoja completa vive en la
    pagina de aprobacion (liga del correo), no dentro del correo."""
    from app.motor.hoja_db import hoja_de
    return resumen_breve(await hoja_de(db, inst, con_urls=False))


def resumen_breve(h: Dict[str, Any]) -> str:
    c = h["cabecera"]
    filas = [("Folio", c["folio"])]
    if not c.get("numero_es_folio"):
        filas.append((c.get("etiqueta") or "Documento", c["numero"]))
    filas += [("Empresa", c["empresa"]), ("Solicitante", c["solicitado_por"])]
    for t in h.get("tablas") or []:
        tot = next((x for x in t.get("totales") or [] if x.get("destacado")), None)
        if tot:
            filas.append((tot["etiqueta"], tot["valor"]))
            break
    if h.get("adjuntos"):
        filas.append(("Archivos adjuntos", str(len(h["adjuntos"]))))
    cuerpo = "".join(f'<tr><td style="padding:6px 10px;color:#64748b;font-size:13px">{k}</td><td style="padding:6px 10px;font-size:13px"><b>{v}</b></td></tr>' for k, v in filas)
    return f"<table style='border-collapse:collapse;background:#f8fafc;border-radius:10px;width:100%'>{cuerpo}</table>"


def _resumen(inst: Instancia, flujo_nombre: str, cfg: Optional[Dict[str, Any]] = None) -> str:
    """Encabezado + los campos del resumen configurado en el flujo + cada lista de cardData como tabla (hasta 15 filas)."""
    from app.motor.resumen import resumen as armar_resumen, secciones
    cd = inst.card_data or {}
    r = armar_resumen(cfg, cd, inst.folio)
    filas = [("Folio", inst.folio)]
    if not r["numero_es_folio"]:
        filas.append(("Documento", r["numero"]))
    filas += [("Flujo", flujo_nombre), ("Empresa", inst.company_name or inst.origen_clave), ("Solicitante", inst.requester_nombre)]
    filas += [(c["etiqueta"], c["valor"]) for c in r["campos"]]
    cuerpo = "".join(f'<tr><td style="padding:6px 10px;color:#64748b;font-size:13px">{k}</td><td style="padding:6px 10px;font-size:13px"><b>{v}</b></td></tr>' for k, v in filas)
    tablas = ""
    for t in secciones(cd, cfg)["tablas"]:
        th = "".join(f"<th style='text-align:left;padding:4px 8px;font-size:11px;color:#64748b'>{c}</th>" for c in t["columnas"][:6])
        tr = "".join("<tr>" + "".join(f"<td style='padding:4px 8px;font-size:12px'>{fila.get(c, '')}</td>" for c in t["columnas"][:6]) + "</tr>" for fila in t["filas"][:15])
        tablas += f"<p style='margin:12px 0 4px;font-size:12px;color:#64748b'><b>{t['titulo']}</b> ({len(t['filas'])})</p><table style='border-collapse:collapse;width:100%;border-top:1px solid #e2e8f0'><tr>{th}</tr>{tr}</table>"
    return f"<table style='border-collapse:collapse;background:#f8fafc;border-radius:10px;width:100%'>{cuerpo}</table>{tablas}"


def _boton(url: str, texto: str) -> str:
    """Boton centrado, azul corporativo, que se ve igual en Outlook (escritorio y web), Gmail y movil:
    celda de tabla con fondo + version VML para Outlook de escritorio, que ignora padding y colores del enlace.
    Las tablas llevan fondo blanco explicito para no heredar el gris que la plantilla corporativa da a las tablas."""
    ancho = max(150, 8 * len(texto) + 44)
    blanco = 'background:#ffffff;border:0;padding:0;'
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#ffffff" style="{blanco}margin:0 auto;">'
        f'<tr><td height="26" bgcolor="#ffffff" style="{blanco}height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>'
        f'<tr><td align="center" bgcolor="#ffffff" style="{blanco}">'
        f'<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{url}" '
        f'style="height:38px;v-text-anchor:middle;width:{ancho}px;" arcsize="20%" stroke="f" fillcolor="#1a4fa0"><w:anchorlock/>'
        f'<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">{texto}</center></v:roundrect><![endif]-->'
        '<!--[if !mso]><!-->'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="{blanco}"><tr>'
        '<td align="center" bgcolor="#1a4fa0" style="background:#1a4fa0;border:0;padding:0;border-radius:8px;">'
        f'<a href="{url}" target="_blank" style="display:inline-block;padding:10px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;'
        f'font-weight:bold;line-height:18px;color:#ffffff !important;text-decoration:none;border-radius:8px;background:#1a4fa0;">'
        f'<span style="color:#ffffff;">{texto}</span></a></td></tr></table>'
        '<!--<![endif]-->'
        '</td></tr>'
        f'<tr><td height="18" bgcolor="#ffffff" style="{blanco}height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>'
        '</table>'
    )


def _alerta(texto: str, color: str = "#f59e0b") -> str:
    fondo = {"#22c55e": "#f0fdf4", "#ef4444": "#fef2f2", "#f59e0b": "#fffbeb", "#3b82f6": "#eff6ff"}.get(color, "#f8fafc")
    borde = {"#22c55e": "#bbf7d0", "#ef4444": "#fecaca", "#f59e0b": "#fde68a", "#3b82f6": "#bfdbfe"}.get(color, "#e2e8f0")
    return f'<div style="border:1px solid {borde};background:{fondo};padding:10px 12px;border-radius:8px;margin:12px 0;font-size:13px">{texto}</div>'


async def _flujo_nombre(db: AsyncSession, inst: Instancia) -> str:
    f = (await db.execute(select(Flujo).where(Flujo.id == inst.flujo_id))).scalar_one_or_none()
    return f.nombre if f else inst.process_id


async def _flujo_resumen_cfg(db: AsyncSession, inst: Instancia) -> Optional[Dict[str, Any]]:
    f = (await db.execute(select(Flujo).where(Flujo.id == inst.flujo_id))).scalar_one_or_none()
    return f.resumen if f else None


def liga_publica(token: str) -> str:
    return f"{config.FRONTEND_URL.rstrip('/')}/aprobar/{token}"


def liga_tramite(inst: Instancia) -> str:
    return f"{config.FRONTEND_URL.rstrip('/')}/app/workflows/seguimiento?tramite={inst.id}"


# ── Eventos ───────────────────────────────────────────────────────────────

async def notificar_turno(db: AsyncSession, inst: Instancia, aviso: Optional[Dict[str, Any]], reenvio_de: Optional[str] = None, por: Optional[Dict[str, Any]] = None) -> None:
    """Le toca a alguien: campana + correo con su liga personal (si el ajuste lo permite). Hace commit."""
    if not aviso:
        return
    etapa = (await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.id == aviso["etapa_id"]))).scalar_one_or_none()
    if not etapa:
        return
    flujo_nombre = await _flujo_nombre(db, inst)
    mandar_correo = (await ajustes_service.obtener(db, "correos.aprobador")) == "true"
    total = (inst.card_data or {}).get("total")
    destinatarios = [(etapa.aprobador_user_id, etapa.aprobador_nombre, etapa.aprobador_email, False)]
    if etapa.suplente_user_id:
        destinatarios.append((etapa.suplente_user_id, etapa.suplente_nombre or "", etapa.suplente_email, True))
    for user_id, nombre, email, es_suplente in destinatarios:
        token = (aviso.get("tokens") or {}).get(user_id)
        await campana(user_id, f"Aprobación pendiente · {inst.folio}", f"{inst.requester_nombre} · {flujo_nombre}" + (f" · {_fmt(total)}" if total is not None else ""), "info",
                      {"instancia_id": inst.id, "folio": inst.folio, "modulo": "workflows", "ruta": f"/app/workflows/bandeja?tramite={inst.id}"})
        if mandar_correo:
            html = (f"<h2 style='margin:0 0 6px'>Tienes una aprobación pendiente</h2><p>Hola {nombre.split(' ')[0] if nombre else ''}:</p>"
                    f"<p>{inst.requester_nombre} envió <b>{flujo_nombre}</b> en {inst.company_name or inst.origen_clave}. Te toca decidir en la etapa <b>{etapa.orden} · {etapa.nombre}</b>"
                    + (" (como suplente: aprueba el primero que responda)" if es_suplente else "") + ".</p>" + await _hoja_html(db, inst)
                    + (_boton(liga_publica(token), "Revisar y decidir") if token else "")
                    + "<p style='font-size:12px;color:#64748b'>La liga es personal y de un solo uso; también puedes decidir desde tu Bandeja en la Intranet.</p>")
            await correo(db, inst, "aprobacion_pendiente", email, nombre, user_id, f"Aprobación pendiente · {inst.folio} · {flujo_nombre}", html, etapa_id=etapa.id, reenvio_de=reenvio_de, por=por)
    bitacora(db, inst.id, "aviso_enviado", por, {"etapa": etapa.orden, "aprobador": etapa.aprobador_nombre, "suplente": etapa.suplente_nombre, "correo": mandar_correo, "reenvio": bool(reenvio_de)})
    await db.commit()


async def correo_solicitante(inst: Instancia) -> Optional[str]:
    """Correo del solicitante: el que trajo el sobre; si vino vacio y esta ligado a un usuario
    de la Intranet, el de su perfil."""
    if inst.requester_email:
        return inst.requester_email
    user_id = inst.requester_user_id
    if not user_id:
        # La liga pudo hacerse despues de que nacio el tramite: se consulta la liga actual
        from app.database import AsyncSessionLocal
        from app.models import ConexionUsuario
        async with AsyncSessionLocal() as db2:
            user_id = (await db2.execute(select(ConexionUsuario.user_id).where(ConexionUsuario.conexion_id == inst.conexion_id,
                                                                               ConexionUsuario.id_externo == inst.requester_id_externo))).scalar_one_or_none()
    if not user_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{config.ADMIN_SERVICE_URL}/internal/users/{user_id}/profile")
        return (r.json() or {}).get("email") if r.status_code == 200 else None
    except Exception:
        return None


async def notificar_recibido(db: AsyncSession, inst: Instancia) -> None:
    """Al solicitante: campana siempre; correo solo si el ajuste 'correos.recibido' esta activo. Hace commit."""
    flujo_nombre = await _flujo_nombre(db, inst)
    await campana(inst.requester_user_id, f"Trámite {inst.folio} recibido", f"{flujo_nombre} · en aprobación", "info", {"instancia_id": inst.id, "folio": inst.folio, "modulo": "workflows", "ruta": liga_tramite(inst)})
    if (await ajustes_service.obtener(db, "correos.recibido")) == "true":
        html = f"<h2 style='margin:0 0 6px'>Recibimos tu trámite</h2><p>Tu {flujo_nombre} entró al flujo de aprobación con el folio <b>{inst.folio}</b>.</p>{await _hoja_html(db, inst)}{_boton(liga_tramite(inst), 'Seguir el trámite')}"
        await correo(db, inst, "recibido", await correo_solicitante(inst), inst.requester_nombre, inst.requester_user_id, f"Recibimos tu {flujo_nombre} · {inst.folio}", html)
        await db.commit()


async def notificar_avance(db: AsyncSession, inst: Instancia, etapa: InstanciaEtapa, aprobo: bool, quien: str) -> None:
    """Campana al solicitante en cada etapa decidida (nunca correo)."""
    await campana(inst.requester_user_id, f"{inst.folio}: etapa {etapa.orden} {'aprobada' if aprobo else 'rechazada'}", f"{etapa.nombre} · {quien}", "success" if aprobo else "warning",
                  {"instancia_id": inst.id, "folio": inst.folio, "modulo": "workflows", "ruta": liga_tramite(inst)})


async def notificar_decision(db: AsyncSession, inst: Instancia, momento: str) -> None:
    """Correo de decision al solicitante. momento: 'decidida' (acaba de cerrar) | 'aplicada' (la plataforma confirmo) | 'pendiente_aplicar'.
    El ajuste correos.decision dice en que momento sale: esperar_afectacion | al_decidir | ninguno. Hace commit."""
    ajuste = await ajustes_service.obtener(db, "correos.decision")
    flujo_nombre = await _flujo_nombre(db, inst)
    aprobada = bool(inst.approved)
    if momento == "decidida":
        await campana(inst.requester_user_id, f"{inst.folio} {'aprobado' if aprobada else 'rechazado'}", flujo_nombre + (" · se está aplicando en la plataforma" if aprobada else ""),
                      "success" if aprobada else "warning", {"instancia_id": inst.id, "folio": inst.folio, "modulo": "workflows", "ruta": liga_tramite(inst)})
    if ajuste == "ninguno":
        return
    # Rechazos: siempre de inmediato (no hay nada que esperar de la plataforma para el solicitante)
    if momento == "decidida" and aprobada and ajuste == "esperar_afectacion":
        return
    if momento == "aplicada" and (ajuste != "esperar_afectacion" or not aprobada):
        return
    ya = (await db.execute(select(CorreoEnviado).where(CorreoEnviado.instancia_id == inst.id, CorreoEnviado.plantilla == "decision",
                                                        CorreoEnviado.resultado.like("aceptado%")))).scalars().first()
    if ya and momento != "pendiente_aplicar":
        return
    etapas = (await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.instancia_id == inst.id).order_by(InstanciaEtapa.orden))).scalars().all()
    hist = "".join(f"<li style='font-size:13px'>Etapa {e.orden} · {e.nombre}: <b>{'aprobó' if e.status == 'aprobada' else 'rechazó'}</b> {e.decidio_nombre or ''}" + (f" — «{e.comentario}»" if e.comentario else "") + "</li>"
                   for e in etapas if e.status in ("aprobada", "rechazada"))
    if momento == "pendiente_aplicar":
        titulo, cuerpo, color = "Aprobada, pendiente de aplicar", f"Tu trámite ya fue aprobado, pero la plataforma todavía no confirma que lo aplicó. TI está atendiendo; te avisamos en cuanto quede.", "#f59e0b"
        plantilla, asunto = "afectacion_fallida", f"{inst.folio} aprobada, pendiente de aplicar"
    elif aprobada:
        titulo, color, plantilla = "Tu trámite fue aprobado", "#22c55e", "decision"
        cuerpo = (f"La plataforma confirmó: <b>{inst.mensaje_plataforma}</b>" if inst.mensaje_plataforma else "La aprobación ya está completa.")
        asunto = f"Tu {flujo_nombre} {inst.folio} fue aprobada"
    else:
        rechazo = next((e for e in etapas if e.status == "rechazada"), None)
        titulo, color, plantilla = "Tu trámite fue rechazado", "#ef4444", "decision"
        cuerpo = f"Rechazó <b>{rechazo.decidio_nombre if rechazo else ''}</b> en la etapa {rechazo.orden if rechazo else ''}" + (f": «{rechazo.comentario}»" if rechazo and rechazo.comentario else ".")
        asunto = f"Tu {flujo_nombre} {inst.folio} fue rechazada"
    html = f"<h2 style='margin:0 0 6px'>{titulo}</h2>{_alerta(cuerpo, color)}{await _hoja_html(db, inst)}<ul style='padding-left:18px'>{hist}</ul>{_boton(liga_tramite(inst), 'Ver el trámite')}"
    await correo(db, inst, plantilla, await correo_solicitante(inst), inst.requester_nombre, inst.requester_user_id, asunto, html)
    bitacora(db, inst.id, "correo_decision", None, {"momento": momento, "plantilla": plantilla, "ajuste": ajuste})
    await db.commit()


async def notificar_ti(db: AsyncSession, inst: Instancia, motivo: str, detalle: str) -> None:
    """A los administradores del modulo (rol workflows:administrador) y super admins: campana + correo."""
    admins: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{config.ADMIN_SERVICE_URL}/internal/users/by-module-role", params={"module_slug": "workflows", "role_slug": "administrador"})
            admins = r.json() if r.status_code == 200 else []
    except Exception:
        admins = []
    for a in admins:
        await campana(a.get("id"), f"Workflows · {motivo} · {inst.folio}", detalle, "warning", {"instancia_id": inst.id, "folio": inst.folio, "modulo": "workflows", "ruta": liga_tramite(inst)})
        await correo(db, inst, "aviso_ti", a.get("email"), a.get("full_name") or a.get("name") or "", a.get("id"), f"Workflows · {motivo} · {inst.folio}",
                     f"<h2 style='margin:0 0 6px'>{motivo}</h2>{_alerta(detalle)}{_boton(liga_tramite(inst), 'Revisar en Seguimiento')}")
    bitacora(db, inst.id, "aviso_ti", None, {"motivo": motivo, "admins": len(admins)})
    await db.commit()


async def revisar_afectaciones_pendientes(db: AsyncSession) -> int:
    """Barrido: tramites aprobados cuya afectacion sigue fallida mas alla de correos.espera_max_min
    y que aun no han avisado 'pendiente de aplicar'. Regresa cuantos aviso."""
    minutos = int(await ajustes_service.obtener(db, "correos.espera_max_min"))
    if (await ajustes_service.obtener(db, "correos.decision")) != "esperar_afectacion":
        return 0
    limite = ahora() - timedelta(minutes=minutos)
    insts = (await db.execute(select(Instancia).where(Instancia.status == "aprobada", Instancia.afectacion == "fallida", Instancia.decidida_en <= limite))).scalars().all()
    n = 0
    for inst in insts:
        ya = (await db.execute(select(Bitacora).where(Bitacora.instancia_id == inst.id, Bitacora.accion == "aviso_pendiente_aplicar"))).scalars().first()
        if ya:
            continue
        bitacora(db, inst.id, "aviso_pendiente_aplicar", None, {"minutos": minutos})
        await db.commit()
        await notificar_decision(db, inst, "pendiente_aplicar")
        await notificar_ti(db, inst, "Aprobada pero la plataforma no la aplica", f"{inst.folio}: {minutos} min sin respuesta de la plataforma. Revisa Seguimiento → Transacciones.")
        n += 1
    return n
