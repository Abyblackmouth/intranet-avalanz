import httpx
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.config import config
from app.models.auth_models import User, UserSession, LoginHistory, PasswordReset
from shared.utils.encryption import (
    hash_password,
    verify_password,
    generate_secure_token,
    hash_sha256,
)
from shared.utils.jwt import (
    create_access_token,
    create_refresh_token,
    create_2fa_temp_token,
    decode_refresh_token,
)
from shared.utils.helpers import get_client_ip, is_corporate_ip, now_utc, is_expired
from shared.exceptions.http_exceptions import (
    UnauthorizedException,
    ForbiddenException,
    NotFoundException,
    InvalidTokenException,
)


# ── Consulta de permisos al admin-service ─────────────────────────────────────

async def fetch_user_permissions(user_id: str) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"http://admin-service:8000/internal/users/{user_id}/permissions"
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return {"roles": [], "modules": [], "companies": [], "permissions": []}


# ── Construccion del payload del token ────────────────────────────────────────

async def build_token_payload(user: User) -> Dict[str, Any]:
    perms = await fetch_user_permissions(str(user.id))
    return {
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "roles": perms.get("roles", []),
        "modules": perms.get("modules", []),
        "companies": perms.get("companies", []),
        "permissions": perms.get("permissions", []),
        "cross_company": perms.get("cross_company", False),
    }


# ── Login ─────────────────────────────────────────────────────────────────────

async def login(
    db: AsyncSession,
    email: str,
    password: str,
    client_ip: str,
    user_agent: str,
) -> Dict[str, Any]:

    # Buscar usuario
    result = await db.execute(
        select(User).where(User.email == email, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedException("Credenciales incorrectas")

    # Verificar si esta activo
    if not user.is_active:
        raise ForbiddenException("Cuenta desactivada, contacta al administrador")

    # Verificar si esta bloqueada
    if user.is_locked:
        if user.lock_type == "failed_attempts":
            raise ForbiddenException("Cuenta bloqueada por multiples intentos fallidos, contacta al administrador")
        raise ForbiddenException("Tu cuenta ha sido bloqueada, contacta al administrador")

    # Verificar contrasena
    if not verify_password(password, user.hashed_password):
        await _register_failed_attempt(db, user, client_ip, user_agent)
        raise UnauthorizedException("Credenciales incorrectas")

    # Verificar contrasena temporal expirada
    if user.is_temp_password and user.temp_password_expires_at:
        if is_expired(user.temp_password_expires_at):
            raise ForbiddenException("La contrasena temporal ha expirado, contacta al administrador")

    # Resetear intentos fallidos
    await db.execute(
        update(User).where(User.id == user.id).values(failed_attempts=0)
    )

    # Primer login con contrasena temporal
    if user.is_temp_password:
        await _save_login_history(db, user, client_ip, user_agent, success=True, failure_reason="temp_password")
        await db.commit()
        return {"action": "change_password", "user_id": str(user.id)}

    # Detectar si es red corporativa
    corporate = is_corporate_ip(client_ip, config.CORPORATE_IP_RANGES)

    # Actualizar ultimo login
    await db.execute(
        update(User).where(User.id == user.id).values(
            last_login_at=now_utc(),
            last_login_ip=client_ip,
        )
    )

    await _save_login_history(
        db, user, client_ip, user_agent,
        success=True,
        is_corporate=corporate,
        requires_2fa=not corporate,
    )
    await db.commit()

    # Red corporativa: entrega tokens directamente
    if corporate:
        return await _issue_tokens(db, user, client_ip, user_agent, corporate=True)

    # Red externa: requiere 2FA
    if not user.is_2fa_configured:
        raise ForbiddenException("El 2FA no esta configurado, contacta al administrador")

    temp_token = create_2fa_temp_token(
        payload={"user_id": str(user.id)},
        secret_key=config.JWT_SECRET_KEY,
        algorithm=config.JWT_ALGORITHM,
        expire_minutes=config.JWT_2FA_TEMP_EXPIRE_MINUTES,
    )
    return {"action": "2fa_required", "temp_token": temp_token}


# ── Verificacion 2FA ──────────────────────────────────────────────────────────

async def verify_2fa(
    db: AsyncSession,
    temp_token: str,
    totp_code: str,
    client_ip: str,
    user_agent: str,
) -> Dict[str, Any]:
    from app.services.twofa_service import verify_totp_code

    payload = decode_2fa_temp_token_safe(temp_token)
    user_id = payload.get("user_id")

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

    valid = await verify_totp_code(db, user, totp_code)
    if not valid:
        raise UnauthorizedException("Codigo 2FA invalido")

    await _save_login_history(
        db, user, client_ip, user_agent,
        success=True,
        is_corporate=False,
        requires_2fa=True,
        completed_2fa=True,
    )
    await db.commit()

    return await _issue_tokens(db, user, client_ip, user_agent, corporate=False)


# ── Cambio de contrasena temporal ─────────────────────────────────────────────

async def change_temp_password(
    db: AsyncSession,
    user_id: str,
    new_password: str,
) -> Dict[str, Any]:
    from shared.utils.helpers import is_strong_password

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

    if not is_strong_password(new_password):
        raise UnauthorizedException(
            "La contrasena debe tener minimo 8 caracteres, una mayuscula, una minuscula, un numero y un caracter especial"
        )

    await db.execute(
        update(User).where(User.id == user.id).values(
            hashed_password=hash_password(new_password),
            is_temp_password=False,
            temp_password_expires_at=None,
        )
    )
    await db.commit()
    return {"action": "setup_2fa", "user_id": str(user.id)}


# ── Refresh token ─────────────────────────────────────────────────────────────

async def refresh_access_token(
    db: AsyncSession,
    refresh_token: str,
    client_ip: str,
) -> Dict[str, Any]:

    payload = decode_refresh_token(
        refresh_token, config.JWT_SECRET_KEY, config.JWT_ALGORITHM
    )
    token_hash = hash_sha256(refresh_token)

    result = await db.execute(
        select(UserSession).where(
            UserSession.refresh_token_hash == token_hash,
            UserSession.is_revoked == False,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise InvalidTokenException("Sesion no encontrada o revocada")

    if is_expired(session.expires_at):
        raise InvalidTokenException("La sesion ha expirado")

    result = await db.execute(
        select(User).where(User.id == session.user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedException("Usuario no disponible")

    # Actualizar ultima actividad
    await db.execute(
        update(UserSession).where(UserSession.id == session.id).values(
            last_activity_at=now_utc()
        )
    )
    await db.commit()

    token_payload = await build_token_payload(user)
    access_token = create_access_token(
        payload=token_payload,
        secret_key=config.JWT_SECRET_KEY,
        algorithm=config.JWT_ALGORITHM,
        expire_minutes=config.JWT_INACTIVITY_EXPIRE_MINUTES,
        absolute_expire_hours=config.JWT_ABSOLUTE_EXPIRE_HOURS,
        session_started_at=session.session_started_at,
    )
    return {"access_token": access_token, "token_type": "bearer"}


# ── Recuperacion de contrasena ────────────────────────────────────────────────

async def request_password_reset(db: AsyncSession, email: str) -> dict:
    from datetime import timedelta

    result = await db.execute(
        select(User).where(User.email == email, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()

    # No revelamos si el email existe o no por seguridad
    if not user:
        return {"status": "sent"}
    # Bloqueado manualmente por admin: no permitir recuperacion
    if user.is_locked and user.lock_type == "manual":
        return {"status": "blocked"}

    token = generate_secure_token()
    token_hash = hash_sha256(token)
    expires_at = now_utc() + timedelta(minutes=config.PASSWORD_RESET_EXPIRE_MINUTES)

    db.add(PasswordReset(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    ))
    await db.commit()

    # El email-service se encarga del envio
    # Se publica evento a RabbitMQ (se implementa en la fase de servicios transversales)
    await _send_password_reset_email(user.email, user.full_name, token)
    return {"status": "sent"}


async def confirm_password_reset(
    db: AsyncSession,
    token: str,
    new_password: str,
) -> None:
    from shared.utils.helpers import is_strong_password

    token_hash = hash_sha256(token)
    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.token_hash == token_hash,
            PasswordReset.is_used == False,
        )
    )
    reset = result.scalar_one_or_none()
    if not reset:
        raise InvalidTokenException("Token de recuperacion invalido")

    if is_expired(reset.expires_at):
        raise InvalidTokenException("El token de recuperacion ha expirado")

    if not is_strong_password(new_password):
        raise UnauthorizedException(
            "La contrasena debe tener minimo 8 caracteres, una mayuscula, una minuscula, un numero y un caracter especial"
        )

    await db.execute(
        update(User).where(User.id == reset.user_id).values(
            hashed_password=hash_password(new_password),
            is_temp_password=False,
            is_locked=False,
            failed_attempts=0,
            locked_at=None,
            lock_type=None,
        )
    )
    await db.execute(
        update(PasswordReset).where(PasswordReset.id == reset.id).values(
            is_used=True,
            used_at=now_utc(),
        )
    )
    await db.commit()


# ── Revocar sesion ────────────────────────────────────────────────────────────

async def revoke_session(
    db: AsyncSession,
    session_id: str,
    requested_by_user_id: str,
    reason: str = "revocado por el usuario",
) -> None:

    result = await db.execute(
        select(UserSession).where(UserSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundException("Sesion")

    if str(session.user_id) != requested_by_user_id:
        raise ForbiddenException("No puedes revocar una sesion que no es tuya")

    await db.execute(
        update(UserSession).where(UserSession.id == session.id).values(
            is_revoked=True,
            revoked_at=now_utc(),
            revoked_reason=reason,
        )
    )
    await db.commit()


# ── Logout ────────────────────────────────────────────────────────────────────

async def logout(db: AsyncSession, refresh_token: str) -> None:
    token_hash = hash_sha256(refresh_token)
    await db.execute(
        update(UserSession).where(UserSession.refresh_token_hash == token_hash).values(
            is_revoked=True,
            revoked_at=now_utc(),
            revoked_reason="logout",
        )
    )
    await db.commit()


# ── Helpers internos ──────────────────────────────────────────────────────────

async def _issue_tokens(
    db: AsyncSession,
    user: User,
    client_ip: str,
    user_agent: str,
    corporate: bool,
) -> Dict[str, Any]:
    from datetime import timedelta

    now = now_utc()
    token_payload = await build_token_payload(user)

    access_token = create_access_token(
        payload=token_payload,
        secret_key=config.JWT_SECRET_KEY,
        algorithm=config.JWT_ALGORITHM,
        expire_minutes=config.JWT_INACTIVITY_EXPIRE_MINUTES,
        absolute_expire_hours=config.JWT_ABSOLUTE_EXPIRE_HOURS,
        session_started_at=now,
    )
    refresh_token = create_refresh_token(
        payload={"user_id": str(user.id)},
        secret_key=config.JWT_SECRET_KEY,
        algorithm=config.JWT_ALGORITHM,
        expire_days=config.JWT_REFRESH_TOKEN_EXPIRE_DAYS,
    )

    # Controlar maximo de sesiones activas
    await _enforce_max_sessions(db, user)

    db.add(UserSession(
        user_id=user.id,
        refresh_token_hash=hash_sha256(refresh_token),
        ip_address=client_ip,
        user_agent=user_agent,
        is_corporate_network=corporate,
        session_started_at=now,
        last_activity_at=now,
        expires_at=now + timedelta(days=config.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "requires_2fa": False,
    }


async def _enforce_max_sessions(db: AsyncSession, user: User) -> None:
    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.is_revoked == False)
        .order_by(UserSession.session_started_at.asc())
    )
    active_sessions = result.scalars().all()

    if len(active_sessions) >= config.MAX_ACTIVE_SESSIONS:
        oldest = active_sessions[0]
        await db.execute(
            update(UserSession).where(UserSession.id == oldest.id).values(
                is_revoked=True,
                revoked_at=now_utc(),
                revoked_reason="limite de sesiones activas alcanzado",
            )
        )


async def _register_failed_attempt(
    db: AsyncSession,
    user: User,
    client_ip: str,
    user_agent: str,
) -> None:
    new_attempts = user.failed_attempts + 1
    should_lock = new_attempts >= config.MAX_FAILED_ATTEMPTS

    await db.execute(
        update(User).where(User.id == user.id).values(
            failed_attempts=new_attempts,
            is_locked=should_lock,
            locked_at=now_utc() if should_lock else None,
            lock_type="failed_attempts" if should_lock else None,
        )
    )
    await _save_login_history(
        db, user, client_ip, user_agent,
        success=False,
        failure_reason=f"contrasena incorrecta (intento {new_attempts})",
    )
    await db.commit()
    if should_lock:
        await _send_account_locked_email(user.email, user.full_name, new_attempts, client_ip)


async def _save_login_history(
    db: AsyncSession,
    user: User,
    client_ip: str,
    user_agent: str,
    success: bool,
    failure_reason: Optional[str] = None,
    is_corporate: bool = False,
    requires_2fa: bool = False,
    completed_2fa: bool = False,
) -> None:
    db.add(LoginHistory(
        user_id=user.id,
        ip_address=client_ip,
        user_agent=user_agent,
        is_corporate_network=is_corporate,
        success=success,
        failure_reason=failure_reason,
        requires_2fa=requires_2fa,
        completed_2fa=completed_2fa,
    ))


def decode_2fa_temp_token_safe(temp_token: str) -> Dict[str, Any]:
    from shared.utils.jwt import decode_2fa_temp_token
    return decode_2fa_temp_token(
        temp_token,
        config.JWT_SECRET_KEY,
        config.JWT_ALGORITHM,
    )

async def _send_account_locked_email(email: str, full_name: str, failed_attempts: int, client_ip: str):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/account-locked",
                json={
                    "to_email": email,
                    "full_name": full_name,
                    "failed_attempts": failed_attempts,
                    "locked_from_ip": client_ip,
                },
            )
    except Exception:
        pass


async def _send_password_reset_email(email: str, full_name: str, reset_link: str):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/password-reset",
                json={
                    "to_email": email,
                    "full_name": full_name,
                    "reset_token": reset_link,
                },
            )
    except Exception:
        pass
