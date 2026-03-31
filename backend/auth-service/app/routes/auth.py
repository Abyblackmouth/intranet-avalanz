from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.config import config
from app.services import auth_service
from app.database import get_db
from shared.models.responses import DataResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator
from shared.utils.helpers import get_client_ip

router = APIRouter(prefix="/auth", tags=["Autenticacion"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas de entrada ────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TwoFARequest(BaseModel):
    temp_token: str
    code: str


class ChangePasswordRequest(BaseModel):
    user_id: str
    new_password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str


class RevokeSessionRequest(BaseModel):
    session_id: str


class LogoutRequest(BaseModel):
    refresh_token: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=DataResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(dict(request.headers), request.client.host)
    user_agent = request.headers.get("user-agent", "")
    result = await auth_service.login(
        db=db,
        email=body.email,
        password=body.password,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    return DataResponse(success=True, message="Login procesado", data=result)


@router.post("/2fa/verify", response_model=DataResponse)
async def verify_2fa(
    body: TwoFARequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(dict(request.headers), request.client.host)
    user_agent = request.headers.get("user-agent", "")
    result = await auth_service.verify_2fa(
        db=db,
        temp_token=body.temp_token,
        totp_code=body.code,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    return DataResponse(success=True, message="2FA verificado exitosamente", data=result)


@router.post("/change-temp-password", response_model=DataResponse)
async def change_temp_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.change_temp_password(
        db=db,
        user_id=body.user_id,
        new_password=body.new_password,
    )
    return DataResponse(success=True, message="Contrasena actualizada exitosamente", data=result)


@router.post("/refresh", response_model=DataResponse)
async def refresh_token(
    body: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(dict(request.headers), request.client.host)
    result = await auth_service.refresh_access_token(
        db=db,
        refresh_token=body.refresh_token,
        client_ip=client_ip,
    )
    return DataResponse(success=True, message="Token renovado exitosamente", data=result)


@router.post("/password-reset/request", response_model=BaseResponse)
async def request_password_reset(
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    await auth_service.request_password_reset(db=db, email=body.email)
    return BaseResponse(
        success=True,
        message="Si el correo existe recibiras un enlace de recuperacion en los proximos minutos",
    )


@router.post("/password-reset/confirm", response_model=BaseResponse)
async def confirm_password_reset(
    body: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db),
):
    await auth_service.confirm_password_reset(
        db=db,
        token=body.token,
        new_password=body.new_password,
    )
    return BaseResponse(success=True, message="Contrasena restablecida exitosamente")


@router.post("/logout", response_model=BaseResponse)
async def logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    await auth_service.logout(db=db, refresh_token=body.refresh_token)
    return BaseResponse(success=True, message="Sesion cerrada exitosamente")


@router.post("/sessions/revoke", response_model=BaseResponse)
async def revoke_session(
    body: RevokeSessionRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    await auth_service.revoke_session(
        db=db,
        session_id=body.session_id,
        requested_by_user_id=payload.get("user_id"),
    )
    return BaseResponse(success=True, message="Sesion revocada exitosamente")


@router.get("/sessions", response_model=DataResponse)
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    from sqlalchemy import select
    from app.models.auth_models import UserSession

    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == payload.get("user_id"),
            UserSession.is_revoked == False,
        ).order_by(UserSession.last_activity_at.desc())
    )
    sessions = result.scalars().all()
    data = [
        {
            "session_id": str(s.id),
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "is_corporate_network": s.is_corporate_network,
            "session_started_at": s.session_started_at.isoformat(),
            "last_activity_at": s.last_activity_at.isoformat(),
            "expires_at": s.expires_at.isoformat(),
        }
        for s in sessions
    ]
    return DataResponse(success=True, message="Sesiones activas obtenidas", data=data)


@router.get("/me", response_model=DataResponse)
async def get_me(payload=Depends(validator.get_current_user())):
    return DataResponse(success=True, message="Usuario autenticado", data=payload)