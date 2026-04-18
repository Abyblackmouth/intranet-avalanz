import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, Dict, Any

from app.config import config
from shared.exceptions.http_exceptions import InternalServerException


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
        <h2>Bienvenido, {full_name}</h2>
        <p>Tu cuenta ha sido creada exitosamente en la plataforma <strong>{config.EMAIL_FROM_NAME}</strong>. A continuación encontrarás tus credenciales de acceso.</p>

        <div class="credentials">
          <div class="credentials-row">
            <span class="credentials-label">Correo</span>
            <span class="credentials-value">{to_email}</span>
          </div>
          <div class="credentials-row">
            <span class="credentials-label">Contraseña</span>
            <span class="credentials-value mono">{temp_password}</span>
          </div>
        </div>

        <div class="alert-box info">
          <span class="alert-icon">&#9432;</span>
          <div class="alert-content">
            <strong>Contraseña temporal</strong>
            Debes cambiar tu contraseña en tu primer inicio de sesión. Esta contraseña es válida por <strong>24 horas</strong>.
          </div>
        </div>

        <div class="btn-wrap">
          <a href="{config.FRONTEND_URL}/change-password?user_id={user_id}" class="btn">Cambiar contraseña</a>
        </div>

        <p class="note">Si no solicitaste esta cuenta, ignora este correo o contacta al administrador.</p>
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
        <h2>Recuperación de contraseña</h2>
        <p>Hola <strong>{full_name}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p>Haz clic en el siguiente botón para crear una nueva contraseña.</p>

        <div class="alert-box">
          <span class="alert-icon">&#9203;</span>
          <div class="alert-content">
            <strong>Enlace válido por 30 minutos</strong>
            Si no solicitaste este cambio, ignora este correo. Tu contraseña actual no será modificada.
          </div>
        </div>

        <div class="btn-wrap">
          <a href="{reset_link}" class="btn">Restablecer contraseña</a>
        </div>

        <hr class="divider">
        <p class="note">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>{reset_link}</p>
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
        <h2>Cuenta bloqueada</h2>
        <p>Hola <strong>{full_name}</strong>, tu cuenta ha sido bloqueada temporalmente por seguridad.</p>

        <div class="alert-box danger">
          <span class="alert-icon">&#9888;</span>
          <div class="alert-content">
            <strong>{failed_attempts} intentos fallidos detectados</strong>
            IP de origen: <strong>{locked_from_ip}</strong><br>
            Fecha: <strong>{datetime.now().strftime("%d/%m/%Y %H:%M")} UTC</strong>
          </div>
        </div>

        <p>Para desbloquear tu cuenta puedes restablecer tu contraseña o contactar al administrador del sistema.</p>

        <div class="btn-wrap">
          <a href="{config.FRONTEND_URL}/reset-password" class="btn">Restablecer contraseña</a>
        </div>

        <hr class="divider">
        <p class="note">Si no reconoces estos intentos, te recomendamos informar al administrador de inmediato.</p>
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
    action_btn = ""
    if action_label and action_url:
        action_btn = f'<div class="btn-wrap"><a href="{action_url}" class="btn">{action_label}</a></div>'

    if alert_type:
        message_block = f"""
        <div class="alert-box {alert_type}">
          <span class="alert-icon">{'&#9888;' if alert_type == 'danger' else '&#9432;' if alert_type == 'info' else '&#9432;'}</span>
          <div class="alert-content">{message}</div>
        </div>"""
    else:
        message_block = f"<p>{message}</p>"

    content = f"""
        <h2>{subject}</h2>
        <p>Hola <strong>{full_name}</strong>,</p>
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
