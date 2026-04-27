import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional

from app.config import config
from shared.exceptions.http_exceptions import InternalServerException


# ── Estilos inline reutilizables ─────────────────────────────────────────────

_H2 = 'style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#0f172a;line-height:1.3;"'
_P  = 'style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#4b5563;line-height:1.6;"'
_NOTE = 'style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;line-height:1.5;"'
_HR = 'style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"'

def _btn(href: str, label: str) -> str:
    return f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
      <tr>
        <td align="center">
          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{href}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="23%" strokecolor="#1a4fa0" fillcolor="#1a4fa0"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">{label}</center></v:roundrect><![endif]-->
          <!--[if !mso]><!-->
          <a href="{href}" style="background-color:#1a4fa0;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:220px;-webkit-text-size-adjust:none;">{label}</a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>'''

def _credentials(rows: list[tuple[str, str]]) -> str:
    rows_html = ""
    for label, value, is_mono in rows:
        val_style = 'style="font-family:Courier New,Courier,monospace;font-size:13px;color:#1a4fa0;background-color:#e2e8f0;padding:2px 8px;"' if is_mono else 'style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;font-weight:500;"'
        rows_html += f'''
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;width:120px;vertical-align:top;">{label}</td>
          <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top;"><span {val_style}>{value}</span></td>
        </tr>'''
    return f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:16px 0;">
      <tr><td style="padding:4px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          {rows_html}
        </table>
      </td></tr>
    </table>'''

def _alert(type_: str, icon: str, title: str, body: str) -> str:
    colors = {
        "info":    {"bg": "#eff6ff", "border": "#3b82f6", "text": "#1e3a5f", "title": "#1e40af"},
        "warning": {"bg": "#fffbeb", "border": "#f59e0b", "text": "#78350f", "title": "#92400e"},
        "danger":  {"bg": "#fef2f2", "border": "#ef4444", "text": "#7f1d1d", "title": "#991b1b"},
        "success": {"bg": "#f0fdf4", "border": "#22c55e", "text": "#14532d", "title": "#166534"},
    }
    c = colors.get(type_, colors["info"])
    return f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:{c['bg']};border:1px solid {c['border']};border-left:4px solid {c['border']};margin:16px 0;">
      <tr>
        <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:{c['text']};">
          <strong style="color:{c['title']};display:block;margin-bottom:4px;">{icon} {title}</strong>
          {body}
        </td>
      </tr>
    </table>'''


# ── Envio base de correo ──────────────────────────────────────────────────────

async def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    to_name: Optional[str] = None,
) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{config.EMAIL_FROM_NAME} <{config.EMAIL_FROM_ADDRESS}>"
    msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    try:
        await aiosmtplib.send(
            msg,
            hostname=config.SMTP_HOST,
            port=config.SMTP_PORT,
            username=config.SMTP_USER or None,
            password=config.SMTP_PASSWORD or None,
            use_tls=config.SMTP_USE_SSL,
            start_tls=config.SMTP_USE_TLS,
        )
    except Exception as e:
        raise InternalServerException(f"Error al enviar correo: {str(e)}")


# ── Renderizado de plantillas ─────────────────────────────────────────────────

def _render(content: str, subject: str) -> str:
    from pathlib import Path
    template_path = Path(__file__).parent.parent / "templates" / "base.html"
    base = template_path.read_text(encoding="utf-8")
    return (
        base
        .replace("{{ subject }}", subject)
        .replace("{{ company_name }}", config.EMAIL_FROM_NAME)
        .replace("{{ year }}", str(datetime.now().year))
        .replace("{{ frontend_url }}", config.FRONTEND_URL)
        .replace("{{ content }}", content)
    )


# ── Correo: bienvenida usuario nuevo ─────────────────────────────────────────

async def send_welcome_email(
    to_email: str,
    full_name: str,
    temp_password: str,
    user_id: str = "",
) -> None:
    subject = f"Bienvenido a {config.EMAIL_FROM_NAME}"
    content = f"""
        <h2 {_H2}>Bienvenido, {full_name}</h2>
        <p {_P}>Tu cuenta ha sido creada exitosamente en la plataforma <strong>{config.EMAIL_FROM_NAME}</strong>. A continuación encontrarás tus credenciales de acceso.</p>
        {_credentials([("Correo", to_email, False), ("Contraseña", temp_password, True)])}
        {_alert("info", "&#9432;", "Contraseña temporal", f"Debes cambiar tu contraseña en tu primer inicio de sesión. Esta contraseña es válida por <strong>24 horas</strong>.")}
        {_btn(f"{config.FRONTEND_URL}/change-password?user_id={user_id}", "Cambiar contraseña")}
        <p {_NOTE}>Si no solicitaste esta cuenta, ignora este correo o contacta al administrador.</p>
    """
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo: recuperacion de contrasena ────────────────────────────────────────

async def send_password_reset_email(
    to_email: str,
    full_name: str,
    reset_token: str,
) -> None:
    reset_link = f"{config.FRONTEND_URL}/reset-password?token={reset_token}"
    subject = "Recuperación de contraseña"
    content = f"""
        <h2 {_H2}>Recuperación de contraseña</h2>
        <p {_P}>Hola <strong>{full_name}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p {_P}>Haz clic en el siguiente botón para crear una nueva contraseña.</p>
        {_alert("warning", "&#9203;", "Enlace válido por 30 minutos", "Si no solicitaste este cambio, ignora este correo. Tu contraseña actual no será modificada.")}
        {_btn(reset_link, "Restablecer contraseña")}
        <hr {_HR}>
        <p {_NOTE}>Si el botón no funciona, copia y pega este enlace en tu navegador:<br>{reset_link}</p>
    """
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo: cuenta bloqueada ──────────────────────────────────────────────────

async def send_account_locked_email(
    to_email: str,
    full_name: str,
    failed_attempts: int,
    locked_from_ip: str,
) -> None:
    subject = "Tu cuenta ha sido bloqueada"
    content = f"""
        <h2 {_H2}>Cuenta bloqueada</h2>
        <p {_P}>Hola <strong>{full_name}</strong>, tu cuenta ha sido bloqueada temporalmente por seguridad.</p>
        {_alert("danger", "&#9888;", f"{failed_attempts} intentos fallidos detectados", f"IP de origen: <strong>{locked_from_ip}</strong><br>Fecha: <strong>{datetime.now().strftime('%d/%m/%Y %H:%M')} UTC</strong>")}
        <p {_P}>Para desbloquear tu cuenta puedes restablecer tu contraseña o contactar al administrador del sistema.</p>
        {_btn(f"{config.FRONTEND_URL}/reset-password", "Restablecer contraseña")}
        <hr {_HR}>
        <p {_NOTE}>Si no reconoces estos intentos, te recomendamos informar al administrador de inmediato.</p>
    """
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo: notificacion general del sistema ──────────────────────────────────

async def send_system_notification_email(
    to_email: str,
    full_name: str,
    subject: str,
    message: str,
    action_label: Optional[str] = None,
    action_url: Optional[str] = None,
    alert_type: Optional[str] = None,
) -> None:
    action_btn = _btn(action_url, action_label) if action_label and action_url else ""
    icons = {"danger": "&#9888;", "info": "&#9432;", "warning": "&#9203;", "success": "&#10003;"}
    if alert_type:
        message_block = _alert(alert_type, icons.get(alert_type, "&#9432;"), subject, message)
    else:
        message_block = f"<p {_P}>{message}</p>"
    content = f"""
        <h2 {_H2}>{subject}</h2>
        <p {_P}>Hola <strong>{full_name}</strong>,</p>
        {message_block}
        {action_btn}
    """
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo generico para modulos futuros ─────────────────────────────────────

async def send_module_email(
    to_email: str,
    full_name: str,
    subject: str,
    html_content: str,
) -> None:
    await send_email(to_email, subject, _render(html_content, subject), full_name)
