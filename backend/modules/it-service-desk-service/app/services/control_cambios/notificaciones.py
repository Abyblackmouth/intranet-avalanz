"""Notificaciones por correo propias de Control de Cambios.

Separado de assignment.py a proposito: el correo de revision de CDC lleva
resumen + PDF adjunto y no comparte formato con los de Incidente."""
import base64
import html

import httpx

from app.config import config

TIPO_LABEL = {
    "nueva_funcionalidad": "Nueva funcionalidad",
    "mejora_existente": "Mejora a funcionalidad existente",
}
NIVEL_LABEL = {
    "alta": "Alta", "media": "Media", "baja": "Baja",
    "alto": "Alto", "medio": "Medio", "bajo": "Bajo",
}
NIVEL_COLOR = {
    "alta": "#dc2626", "alto": "#dc2626",
    "media": "#d97706", "medio": "#d97706",
    "baja": "#16a34a", "bajo": "#16a34a",
}
FONT = "font-family:Arial,Helvetica,sans-serif;"


def _e(value) -> str:
    return html.escape(str(value)) if value not in (None, "") else "—"


def _recortar(texto: str, limite: int) -> str:
    texto = (texto or "").strip()
    if len(texto) <= limite:
        return texto
    return texto[:limite].rsplit(" ", 1)[0] + "…"


def _parrafo(texto: str, limite: int) -> str:
    return html.escape(_recortar(texto, limite)).replace("\n", "<br>")


def _fecha_ddmmyyyy(iso: str) -> str:
    if not iso:
        return "Sin fecha definida"
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def _nivel(valor: str) -> str:
    color = NIVEL_COLOR.get(valor, "#1e293b")
    return f'<span style="{FONT}font-size:14px;font-weight:600;color:{color};">{_e(NIVEL_LABEL.get(valor, valor))}</span>'


def _fila(label: str, value_html: str) -> str:
    return f'''
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;width:130px;vertical-align:top;">
            <span style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;">{label}</span>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top;{FONT}font-size:14px;color:#1e293b;font-weight:600;">
            {value_html}
          </td>
        </tr>'''


def build_cdc_revision_html(destinatario_nombre: str, datos: dict) -> str:
    folio = f'<span style="font-family:Courier New,Courier,monospace;font-size:13px;color:#1a4fa0;background-color:#dbeafe;padding:3px 10px;display:inline-block;">{_e(datos["folio"])}</span>'
    alcance = _e(datos["sistema_nombre"])
    if datos.get("modulo_nombre"):
        alcance += f' <span style="color:#94a3b8;">→</span> {_e(datos["modulo_nombre"])}'

    filas = "".join([
        _fila("Folio", folio),
        _fila("Tipo", _e(TIPO_LABEL.get(datos["tipo_solicitud"], datos["tipo_solicitud"]))),
        _fila("Solicitante", f'{_e(datos["solicitante_nombre"])}<br><span style="font-weight:normal;color:#64748b;font-size:13px;">{_e(datos["area"])} · {_e(datos["empresa"])}</span>'),
        _fila("Alcance", alcance),
        _fila("Urgencia", _nivel(datos["urgencia"])),
        _fila("Impacto", _nivel(datos["impacto"])),
        _fila("Requerido para", _e(_fecha_ddmmyyyy(datos.get("fecha_requerida")))),
        _fila("Registrado", _e(datos["fecha"])),
    ])

    boton = ""
    frontend_url = getattr(config, "FRONTEND_URL", "") or ""
    if frontend_url:
        boton = f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
      <tr>
        <td style="background-color:#1a4fa0;border-radius:10px;">
          <a href="{frontend_url.rstrip('/')}/app/it-service-desk/mesa-de-soporte" style="display:inline-block;padding:12px 28px;{FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Revisar en Tablero Proyectos</a>
        </td>
      </tr>
    </table>'''

    return f'''
    <p style="{FONT}font-size:15px;color:#1e293b;margin:0 0 12px;">Hola {_e(destinatario_nombre)},</p>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eff6ff;border-left:4px solid #3b82f6;margin:12px 0 16px;">
      <tr>
        <td style="padding:12px 16px;{FONT}font-size:13px;color:#1e3a5f;line-height:1.55;">
          <strong style="color:#1e40af;display:block;margin-bottom:4px;">Nuevo Control de Cambios para revisión</strong>
          Se registró una solicitud que requiere revisión por Gerencia de Proyectos. La solicitud completa va adjunta en PDF.
        </td>
      </tr>
    </table>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:16px 0 20px;">
      {filas}
    </table>

    <p style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Resumen de la solicitud</p>
    <p style="{FONT}font-size:16px;color:#0f172a;font-weight:bold;margin:0 0 8px;">{_e(datos["titulo"])}</p>
    <p style="{FONT}font-size:14px;color:#334155;line-height:1.6;margin:0 0 16px;">{_parrafo(datos["descripcion"], 450)}</p>

    <p style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Justificación</p>
    <p style="{FONT}font-size:14px;color:#334155;line-height:1.6;margin:0 0 8px;">{_parrafo(datos["justificacion"], 300)}</p>
    {boton}
    <p style="{FONT}font-size:12px;color:#64748b;margin:16px 0 0;">📎 Adjunto: SOLICITUD_{_e(datos["folio"])}.pdf con el detalle completo.</p>'''


async def send_cdc_revision_email(db, incident, destinatario: dict) -> None:
    """Correo al PM (o Incident Manager activado como PM) cuando el motor le
    asigna un CDC: resumen + PDF de la solicitud adjunto. El PDF se regenera
    con el mismo helper que usa la creacion, asi que es el mismo documento
    que quedo en MinIO."""
    from sqlalchemy import select
    from app.models.mesa_de_soporte import ControlCambiosDetalle
    from app.routes.control_cambios.control_cambios import _build_cdc_pdf_data, _generar_pdf_solicitud
    from app.assignment import _get_user_profile

    res = await db.execute(select(ControlCambiosDetalle).where(ControlCambiosDetalle.incident_id == incident.id))
    detalle = res.scalar_one_or_none()
    if not detalle:
        print(f"[CDC] {incident.folio}: sin control_cambios_detalle, no se envia correo de revision")
        return

    solicitante = await _get_user_profile(incident.requester_id)
    datos = await _build_cdc_pdf_data(db, incident, detalle, solicitante.get("email", ""))
    pdf_bytes = _generar_pdf_solicitud(datos)

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "http://email-service:8000/api/v1/email/module",
            json={
                "to_email": destinatario["email"],
                "full_name": destinatario.get("full_name", ""),
                "subject": f"Control de Cambios {incident.folio} para revision",
                "html_content": build_cdc_revision_html(destinatario.get("full_name", ""), datos),
                "attachments": [{
                    "filename": f"SOLICITUD_{incident.folio}.pdf",
                    "content_base64": base64.b64encode(pdf_bytes).decode("ascii"),
                    "subtype": "pdf",
                }],
            },
        )
        resp.raise_for_status()


# ── Dictamen de revision -> solicitante ──────────────────────────────────────

DICTAMEN_MAIL = {
    "procede": (("#f0fdf4", "#22c55e", "#166534", "#14532d"), "Tu solicitud fue aprobada",
                "Gerencia de Proyectos revisó tu Control de Cambios y procede. El siguiente paso es la priorización, donde se define la fecha estimada de entrega."),
    "ajuste_alcance": (("#fffbeb", "#f59e0b", "#92400e", "#78350f"), "Se propone un ajuste de alcance",
                       "Gerencia de Proyectos revisó tu solicitud y propone ajustar el alcance. El proyecto continúa cuando apruebes el ajuste."),
    "no_procede": (("#fef2f2", "#ef4444", "#991b1b", "#7f1d1d"), "Tu solicitud no procede",
                   "Gerencia de Proyectos revisó tu Control de Cambios y determinó que no procede. Abajo está el motivo; el dictamen completo va adjunto."),
}
RESULTADO_LABEL = {"procede": "Procede", "ajuste_alcance": "Procede con ajuste de alcance", "no_procede": "No procede"}


def build_cdc_dictamen_html(solicitante_nombre: str, folio: str, titulo: str, reviso: str, datos: dict) -> str:
    (bg, bl, tc, bc), alert_t, alert_b = DICTAMEN_MAIL[datos["resultado"]]
    folio_html = f'<span style="font-family:Courier New,Courier,monospace;font-size:13px;color:#1a4fa0;background-color:#dbeafe;padding:3px 10px;display:inline-block;">{_e(folio)}</span>'
    filas = "".join([
        _fila("Folio", folio_html), _fila("Proyecto", _e(titulo)),
        _fila("Resultado", f'<span style="color:{tc};">{_e(RESULTADO_LABEL[datos["resultado"]])}</span>'),
        _fila("Revisó", _e(reviso)),
    ])
    extra = ""
    if datos["resultado"] == "ajuste_alcance":
        extra = f'''
    <p style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Alcance propuesto</p>
    <p style="{FONT}font-size:14px;color:#334155;line-height:1.6;margin:0 0 14px;">{_parrafo(datos.get("alcance_propuesto"), 600)}</p>
    <p style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Motivo del ajuste</p>
    <p style="{FONT}font-size:14px;color:#334155;line-height:1.6;margin:0 0 14px;">{_parrafo(datos.get("motivo_ajuste"), 400)}</p>'''
    if datos["resultado"] == "no_procede":
        extra = f'''
    <p style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Motivo · {_e(datos.get("motivo_rechazo_categoria"))}</p>
    <p style="{FONT}font-size:14px;color:#334155;line-height:1.6;margin:0 0 14px;">{_parrafo(datos.get("motivo_rechazo"), 600)}</p>'''
    if datos.get("comentarios"):
        extra += f'''
    <p style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Comentarios de Gerencia de Proyectos</p>
    <p style="{FONT}font-size:14px;color:#334155;line-height:1.6;margin:0 0 14px;">{_parrafo(datos.get("comentarios"), 600)}</p>'''

    frontend_url = (getattr(config, "FRONTEND_URL", "") or "").rstrip("/")
    boton = f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;">
      <tr><td style="background-color:#1a4fa0;border-radius:10px;">
        <a href="{frontend_url}/app/it-service-desk/mesa-de-soporte" style="display:inline-block;padding:12px 28px;{FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Ver mi solicitud</a>
      </td></tr>
    </table>''' if frontend_url else ""

    return f'''
    <p style="{FONT}font-size:15px;color:#1e293b;margin:0 0 12px;">Hola {_e(solicitante_nombre)},</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:{bg};border-left:4px solid {bl};margin:12px 0 16px;">
      <tr><td style="padding:12px 16px;{FONT}font-size:13px;color:{bc};line-height:1.55;">
        <strong style="color:{tc};display:block;margin-bottom:4px;">{alert_t}</strong>{alert_b}
      </td></tr>
    </table>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:16px 0 20px;">{filas}</table>
    {extra}{boton}
    <p style="{FONT}font-size:12px;color:#64748b;margin:16px 0 0;">📎 Adjunto: dictamen de revisión en PDF.</p>'''


async def send_cdc_dictamen_email(to_email: str, solicitante_nombre: str, folio: str, titulo: str,
                                  reviso: str, datos: dict, pdf_bytes: bytes, pdf_filename: str) -> None:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "http://email-service:8000/api/v1/email/module",
            json={
                "to_email": to_email,
                "full_name": solicitante_nombre,
                "subject": f"Dictamen de tu Control de Cambios {folio}",
                "html_content": build_cdc_dictamen_html(solicitante_nombre, folio, titulo, reviso, datos),
                "attachments": [{"filename": pdf_filename, "content_base64": base64.b64encode(pdf_bytes).decode("ascii"), "subtype": "pdf"}],
            },
        )
        resp.raise_for_status()


# ── Priorizacion -> solicitante ──────────────────────────────────────────────

def build_cdc_priorizacion_html(solicitante_nombre: str, folio: str, titulo: str, reviso: str,
                                prioridad_codigo: str, urgencia_label: str, fecha_label: str, desarrolla_label: str) -> str:
    folio_html = f'<span style="font-family:Courier New,Courier,monospace;font-size:13px;color:#1a4fa0;background-color:#dbeafe;padding:3px 10px;display:inline-block;">{_e(folio)}</span>'
    filas = "".join([
        _fila("Folio", folio_html), _fila("Proyecto", _e(titulo)),
        _fila("Prioridad", f"{_e(prioridad_codigo)} · {_e(urgencia_label)}"),
        _fila("Entrega", f'<span style="color:#1a4fa0;">{_e(fecha_label)}</span>'),
        _fila("Desarrolla", _e(desarrolla_label)), _fila("Priorizó", _e(reviso)),
    ])
    frontend_url = (getattr(config, "FRONTEND_URL", "") or "").rstrip("/")
    boton = f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;">
      <tr><td style="background-color:#1a4fa0;border-radius:10px;">
        <a href="{frontend_url}/app/it-service-desk/mesa-de-soporte" style="display:inline-block;padding:12px 28px;{FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Ver mi solicitud</a>
      </td></tr>
    </table>''' if frontend_url else ""
    return f'''
    <p style="{FONT}font-size:15px;color:#1e293b;margin:0 0 12px;">Hola {_e(solicitante_nombre)},</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eff6ff;border-left:4px solid #3b82f6;margin:12px 0 16px;">
      <tr><td style="padding:12px 16px;{FONT}font-size:13px;color:#1e3a5f;line-height:1.55;">
        <strong style="color:#1e40af;display:block;margin-bottom:4px;">Tu proyecto fue priorizado</strong>
        Gerencia de Proyectos definió la prioridad y el compromiso de entrega de tu Control de Cambios. El siguiente paso es el desarrollo.
      </td></tr>
    </table>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:16px 0 20px;">{filas}</table>
    {boton}
    <p style="{FONT}font-size:12px;color:#64748b;margin:16px 0 0;">📎 Adjunto: priorización en PDF.</p>'''


async def send_cdc_priorizacion_email(to_email: str, solicitante_nombre: str, folio: str, titulo: str, reviso: str,
                                      prioridad_codigo: str, urgencia_label: str, fecha_label: str, desarrolla_label: str,
                                      pdf_bytes: bytes, pdf_filename: str) -> None:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "http://email-service:8000/api/v1/email/module",
            json={
                "to_email": to_email, "full_name": solicitante_nombre,
                "subject": f"Tu Control de Cambios {folio} fue priorizado",
                "html_content": build_cdc_priorizacion_html(solicitante_nombre, folio, titulo, reviso, prioridad_codigo,
                                                            urgencia_label, fecha_label, desarrolla_label),
                "attachments": [{"filename": pdf_filename, "content_base64": base64.b64encode(pdf_bytes).decode("ascii"), "subtype": "pdf"}],
            },
        )
        resp.raise_for_status()
