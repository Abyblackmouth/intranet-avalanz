from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any

from app.config import config
from app.services.email_service import (
    send_welcome_email,
    send_password_reset_email,
    send_account_locked_email,
    send_system_notification_email,
    send_module_email,
    send_raw_html_email,
)
from shared.models.responses import BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/email", tags=["Correo"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas ───────────────────────────────────────────────────────────────────

class WelcomeEmailRequest(BaseModel):
    to_email: EmailStr
    full_name: str
    temp_password: str
    user_id: str = ""


class PasswordResetEmailRequest(BaseModel):
    to_email: EmailStr
    full_name: str
    reset_token: str


class AccountLockedEmailRequest(BaseModel):
    to_email: EmailStr
    full_name: str
    failed_attempts: int
    locked_from_ip: str


class SystemNotificationEmailRequest(BaseModel):
    to_email: EmailStr
    full_name: str
    subject: str
    message: str
    action_label: Optional[str] = None
    action_url: Optional[str] = None
    alert_type: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = None


class InlineImage(BaseModel):
    content_id: str
    data_base64: str
    subtype: str = "png"


class ModuleEmailRequest(BaseModel):
    to_email: EmailStr
    full_name: str
    subject: str
    html_content: str
    inline_images: Optional[List[InlineImage]] = None


# ── Endpoints internos ────────────────────────────────────────────────────────

@router.post("/welcome", response_model=BaseResponse, include_in_schema=False)
async def welcome_email(body: WelcomeEmailRequest):
    await send_welcome_email(
        to_email=body.to_email,
        full_name=body.full_name,
        temp_password=body.temp_password,
        user_id=body.user_id,
    )
    return BaseResponse(success=True, message="Correo de bienvenida enviado")


@router.post("/password-reset", response_model=BaseResponse, include_in_schema=False)
async def password_reset_email(body: PasswordResetEmailRequest):
    await send_password_reset_email(
        to_email=body.to_email,
        full_name=body.full_name,
        reset_token=body.reset_token,
    )
    return BaseResponse(success=True, message="Correo de recuperacion enviado")


@router.post("/account-locked", response_model=BaseResponse, include_in_schema=False)
async def account_locked_email(body: AccountLockedEmailRequest):
    await send_account_locked_email(
        to_email=body.to_email,
        full_name=body.full_name,
        failed_attempts=body.failed_attempts,
        locked_from_ip=body.locked_from_ip,
    )
    return BaseResponse(success=True, message="Correo de cuenta bloqueada enviado")


@router.post("/system-notification", response_model=BaseResponse, include_in_schema=False)
async def system_notification_email(body: SystemNotificationEmailRequest):
    await send_system_notification_email(
        to_email=body.to_email,
        full_name=body.full_name,
        subject=body.subject,
        message=body.message,
        action_label=body.action_label,
        action_url=body.action_url,
        alert_type=body.alert_type,
        fields=body.fields,
    )
    return BaseResponse(success=True, message="Notificacion enviada")


@router.post("/module", response_model=BaseResponse, include_in_schema=False)
async def module_email(body: ModuleEmailRequest):
    await send_module_email(
        to_email=body.to_email,
        full_name=body.full_name,
        subject=body.subject,
        html_content=body.html_content,
    )
    return BaseResponse(success=True, message="Correo de modulo enviado")

@router.post("/raw-html", response_model=BaseResponse, include_in_schema=False)
async def raw_html_email(body: ModuleEmailRequest):
    import base64
    imgs = None
    if body.inline_images:
        imgs = [
            {"content_id": img.content_id, "data": base64.b64decode(img.data_base64), "subtype": img.subtype}
            for img in body.inline_images
        ]
    await send_raw_html_email(
        to_email=body.to_email,
        full_name=body.full_name,
        subject=body.subject,
        html_content=body.html_content,
        inline_images=imgs,
    )
    return BaseResponse(success=True, message="Correo con HTML propio enviado")
