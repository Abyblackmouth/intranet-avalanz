import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional

from app.config import config
from shared.exceptions.http_exceptions import InternalServerException


# ── Helpers de HTML inline ────────────────────────────────────────────────────

def _h2(text: str) -> str:
    return f'<h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;line-height:1.3;">{text}</h2>'

def _p(text: str) -> str:
    return f'<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#4b5563;line-height:1.6;">{text}</p>'

def _note(text: str) -> str:
    return f'<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;line-height:1.5;">{text}</p>'

def _hr() -> str:
    return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td style="border-top:1px solid #e5e7eb;padding:0;margin:0;height:1px;line-height:1px;font-size:1px;">&nbsp;</td></tr></table>'

def _btn(href: str, label: str) -> str:
    return f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 4px;">
      <tr>
        <td align="center">
          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{href}" style="height:42px;v-text-anchor:middle;width:200px;" arcsize="10%" strokecolor="#1a4fa0" fillcolor="#1a4fa0"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">{label}</center></v:roundrect><![endif]-->
          <!--[if !mso]><!-->
          <a href="{href}" style="background-color:#1a4fa0;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:42px;text-align:center;text-decoration:none;padding:0 28px;min-width:160px;">
            {label}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>'''

def _credentials(rows: list) -> str:
    rows_html = ""
    for label, value, is_mono in rows:
        val_style = (
            'font-family:Courier New,Courier,monospace;font-size:13px;color:#1a4fa0;background-color:#dbeafe;padding:3px 10px;display:inline-block;'
            if is_mono else
            'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;font-weight:600;'
        )
        rows_html += f'''
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;width:110px;vertical-align:middle;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;">{label}</span>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
            <span style="{val_style}">{value}</span>
          </td>
        </tr>'''
    return f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:16px 0 12px;">
      {rows_html}
    </table>'''

def _alert(type_: str, title: str, body: str) -> str:
    cfg = {
        "info":    {"bg": "#eff6ff", "bl": "#3b82f6", "tc": "#1e40af", "bc": "#1e3a5f"},
        "warning": {"bg": "#fffbeb", "bl": "#f59e0b", "tc": "#92400e", "bc": "#78350f"},
        "danger":  {"bg": "#fef2f2", "bl": "#ef4444", "tc": "#991b1b", "bc": "#7f1d1d"},
        "success": {"bg": "#f0fdf4", "bl": "#22c55e", "tc": "#166534", "bc": "#14532d"},
    }
    c = cfg.get(type_, cfg["info"])
    return f'''
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:{c['bg']};border-left:4px solid {c['bl']};margin:12px 0 16px;">
      <tr>
        <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:{c['bc']};line-height:1.55;">
          <strong style="color:{c['tc']};display:block;margin-bottom:4px;">{title}</strong>
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
    subject = f"Bienvenido a Intranet {config.EMAIL_FROM_NAME}"
    content = (
        _h2(f"Bienvenido, {full_name}") +
        _p(f"Tu cuenta ha sido creada exitosamente en la plataforma <strong>Intranet {config.EMAIL_FROM_NAME}</strong>. A continuación encontrarás tus credenciales de acceso.") +
        _credentials([("Correo", to_email, False), ("Contraseña", temp_password, True)]) +
        _alert("info", "Contraseña temporal", f"Debes cambiar tu contraseña en tu primer inicio de sesión. Esta contraseña es válida por <strong>24 horas</strong>.") +
        _btn(f"{config.FRONTEND_URL}/change-password?user_id={user_id}", "Cambiar contraseña") +
        _note("Si no solicitaste esta cuenta, ignora este correo o contacta al administrador.")
    )
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo: recuperacion de contrasena ────────────────────────────────────────

async def send_password_reset_email(
    to_email: str,
    full_name: str,
    reset_token: str,
) -> None:
    reset_link = f"{config.FRONTEND_URL}/reset-password?token={reset_token}"
    subject = "Recuperación de contraseña — Intranet Avalanz"
    content = (
        _h2("Recuperación de contraseña") +
        _p(f"Hola <strong>{full_name}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.") +
        _p("Haz clic en el siguiente botón para crear una nueva contraseña.") +
        _alert("warning", "Enlace válido por 30 minutos", "Si no solicitaste este cambio, ignora este correo. Tu contraseña actual no será modificada.") +
        _btn(reset_link, "Restablecer contraseña") +
        _hr() +
        _note(f"Si el botón no funciona, copia y pega este enlace en tu navegador:<br>{reset_link}")
    )
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo: cuenta bloqueada ──────────────────────────────────────────────────

async def send_account_locked_email(
    to_email: str,
    full_name: str,
    failed_attempts: int,
    locked_from_ip: str,
) -> None:
    subject = "Tu cuenta ha sido bloqueada — Intranet Avalanz"
    content = (
        _h2("Cuenta bloqueada") +
        _p(f"Hola <strong>{full_name}</strong>, tu cuenta ha sido bloqueada temporalmente por seguridad.") +
        _alert("danger", f"{failed_attempts} intentos fallidos detectados", f"IP de origen: <strong>{locked_from_ip}</strong><br>Fecha: <strong>{datetime.now().strftime('%d/%m/%Y %H:%M')} UTC</strong>") +
        _p("Para desbloquear tu cuenta puedes restablecer tu contraseña o contactar al administrador del sistema.") +
        _btn(f"{config.FRONTEND_URL}/reset-password", "Restablecer contraseña") +
        _hr() +
        _note("Si no reconoces estos intentos, te recomendamos informar al administrador de inmediato.")
    )
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
    if alert_type:
        message_block = _alert(alert_type, subject, message)
    else:
        message_block = _p(message)
    content = (
        _h2(subject) +
        _p(f"Hola <strong>{full_name}</strong>,") +
        message_block +
        action_btn
    )
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo generico para modulos futuros ─────────────────────────────────────

async def send_module_email(
    to_email: str,
    full_name: str,
    subject: str,
    html_content: str,
) -> None:
    await send_email(to_email, subject, _render(html_content, subject), full_name)
