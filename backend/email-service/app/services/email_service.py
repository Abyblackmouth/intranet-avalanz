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
        .replace("{{ content }}", content)
    )


# ── Correo: bienvenida usuario nuevo ─────────────────────────────────────────

async def send_welcome_email(
    to_email: str,
    full_name: str,
    temp_password: str,
) -> None:
    subject = f"Bienvenido a {config.EMAIL_FROM_NAME}"
    content = f"""
        <h2>Bienvenido, {full_name}</h2>
        <p>Tu cuenta ha sido creada exitosamente en la plataforma <strong>{config.EMAIL_FROM_NAME}</strong>.</p>
        <p>Tus credenciales de acceso son:</p>
        <div class="alert-box">
            <strong>Correo:</strong> {to_email}<br>
            <strong>Contrasena temporal:</strong> {temp_password}
        </div>
        <p>Por seguridad, debes cambiar tu contrasena en tu primer inicio de sesion. Esta contrasena temporal es valida por <strong>24 horas</strong>.</p>
        <p style="text-align:center;">
            <a href="{config.FRONTEND_URL}/login" class="btn">Iniciar sesion</a>
        </p>
        <hr class="divider">
        <p style="color:#999;font-size:13px;">Si no solicitaste esta cuenta, ignora este correo o contacta al administrador.</p>
    """
    await send_email(to_email, subject, _render(content, subject), full_name)


# ── Correo: recuperacion de contrasena ────────────────────────────────────────

async def send_password_reset_email(
    to_email: str,
    full_name: str,
    reset_token: str,
) -> None:
    reset_link = f"{config.FRONTEND_URL}/reset-password?token={reset_token}"
    subject = "Recuperacion de contrasena"
    content = f"""
        <h2>Recuperacion de contrasena</h2>
        <p>Hola {full_name}, recibimos una solicitud para restablecer la contrasena de tu cuenta.</p>
        <p>Haz clic en el siguiente boton para crear una nueva contrasena. Este enlace es valido por <strong>30 minutos</strong>.</p>
        <p style="text-align:center;">
            <a href="{reset_link}" class="btn">Restablecer contrasena</a>
        </p>
        <hr class="divider">
        <p style="color:#999;font-size:13px;">Si no solicitaste este cambio, ignora este correo. Tu contrasena actual no sera modificada.</p>
        <p style="color:#999;font-size:13px;">Si el boton no funciona, copia y pega este enlace en tu navegador:<br>{reset_link}</p>
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
        <p>Hola {full_name}, tu cuenta ha sido bloqueada temporalmente debido a <strong>{failed_attempts} intentos fallidos</strong> de inicio de sesion.</p>
        <div class="alert-box danger">
            <strong>IP de origen:</strong> {locked_from_ip}<br>
            <strong>Fecha:</strong> {datetime.now().strftime("%d/%m/%Y %H:%M")} UTC
        </div>
        <p>Para desbloquear tu cuenta, contacta al administrador del sistema.</p>
        <hr class="divider">
        <p style="color:#999;font-size:13px;">Si fuiste tu quien intento acceder, contacta al administrador para que desbloquee tu cuenta.</p>
        <p style="color:#999;font-size:13px;">Si no reconoces estos intentos, te recomendamos informar al administrador inmediatamente.</p>
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
        action_btn = f'<p style="text-align:center;"><a href="{action_url}" class="btn">{action_label}</a></p>'

    alert_class = f"alert-box {alert_type}" if alert_type else ""
    message_block = f'<div class="{alert_class}">{message}</div>' if alert_type else f"<p>{message}</p>"

    content = f"""
        <h2>{subject}</h2>
        <p>Hola {full_name},</p>
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