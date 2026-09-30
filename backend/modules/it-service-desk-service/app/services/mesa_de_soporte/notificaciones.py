"""Notificaciones por correo de Incidentes."""
import html

import httpx

from app.config import config
from app.services.control_cambios.notificaciones import FONT, _e, _fila


def build_reapertura_html(asignado: str, folio: str, titulo: str, reabrio: str, rol_reabrio: str,
                          motivo: str, resuelto_el: str, reabierto_el: str) -> str:
    """Alerta sobria: tono ambar suave en lugar del azul informativo, para que
    se distinga de una asignacion nueva sin parecer una emergencia."""
    folio_html = f'<span style="font-family:Courier New,Courier,monospace;font-size:13px;color:#1a4fa0;background-color:#dbeafe;padding:3px 10px;display:inline-block;">{_e(folio)}</span>'
    filas = "".join([
        _fila("Folio", folio_html), _fila("Ticket", _e(titulo)),
        _fila("Reabrió", f'{_e(reabrio)} <span style="font-weight:normal;color:#64748b;">· {_e(rol_reabrio)}</span>'),
        _fila("Resuelto el", _e(resuelto_el)), _fila("Reabierto el", _e(reabierto_el)),
    ])
    motivo_html = html.escape(motivo).replace("\n", "<br>")
    frontend_url = (getattr(config, "FRONTEND_URL", "") or "").rstrip("/")
    boton = f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
      <tr><td align="center" bgcolor="#1a4fa0" style="background-color:#1a4fa0;border-radius:10px;padding:12px 28px;"><a href="{frontend_url}/app/it-service-desk/mesa-de-soporte" style="{FONT}font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;">Retomar el ticket</a></td></tr>
    </table>''' if frontend_url else ""
    return f'''
    <p style="{FONT}font-size:15px;color:#1e293b;margin:0 0 12px;">Hola {_e(asignado)},</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fffbeb;border-left:4px solid #f59e0b;margin:12px 0 16px;">
      <tr><td style="padding:12px 16px;{FONT}font-size:13px;color:#78350f;line-height:1.55;">
        <strong style="color:#92400e;display:block;margin-bottom:4px;">&#8634; Ticket reabierto</strong>
        Un ticket que resolviste se reabrió y regresa a tu bandeja. Abajo está el motivo.
      </td></tr>
    </table>
    <p style="{FONT}font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Motivo de la reapertura</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;">
      <tr><td style="background-color:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;{FONT}font-size:14px;color:#334155;line-height:1.6;">{motivo_html}</td></tr>
    </table>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:0 0 8px;">{filas}</table>
    {boton}'''


async def send_reapertura_email(to_email: str, asignado: str, folio: str, titulo: str, reabrio: str,
                                rol_reabrio: str, motivo: str, resuelto_el: str, reabierto_el: str) -> None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post("http://email-service:8000/api/v1/email/module", json={
            "to_email": to_email, "full_name": asignado,
            "subject": f"Ticket {folio} reabierto",
            "html_content": build_reapertura_html(asignado, folio, titulo, reabrio, rol_reabrio, motivo, resuelto_el, reabierto_el),
        })
        resp.raise_for_status()
