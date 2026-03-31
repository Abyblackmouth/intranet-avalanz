from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from jose import JWTError, jwt
from shared.exceptions.http_exceptions import InvalidTokenException


# ── Generacion de tokens ──────────────────────────────────────────────────────

def create_access_token(
    payload: Dict[str, Any],
    secret_key: str,
    algorithm: str,
    expire_minutes: int,
    absolute_expire_hours: int = 8,
    session_started_at: Optional[datetime] = None,
) -> str:
    data = payload.copy()
    now = datetime.now(timezone.utc)

    # Si no se pasa session_started_at es porque es un login nuevo
    started_at = session_started_at or now
    absolute_expire = started_at + timedelta(hours=absolute_expire_hours)

    # El token expira por inactividad o por tiempo absoluto, lo que ocurra primero
    inactivity_expire = now + timedelta(minutes=expire_minutes)
    expire = min(inactivity_expire, absolute_expire)

    data.update({
        "exp": expire,
        "iat": now,
        "type": "access",
        "session_started_at": started_at.isoformat(),
        "absolute_exp": absolute_expire.isoformat(),
    })
    return jwt.encode(data, secret_key, algorithm=algorithm)


def create_refresh_token(
    payload: Dict[str, Any],
    secret_key: str,
    algorithm: str,
    expire_days: int,
) -> str:
    data = payload.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=expire_days)
    data.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    })
    return jwt.encode(data, secret_key, algorithm=algorithm)


def create_2fa_temp_token(
    payload: Dict[str, Any],
    secret_key: str,
    algorithm: str,
    expire_minutes: int = 15,
) -> str:
    data = payload.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    data.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "2fa_temp",
    })
    return jwt.encode(data, secret_key, algorithm=algorithm)


# ── Decodificacion y validacion ───────────────────────────────────────────────

def decode_token(
    token: str,
    secret_key: str,
    algorithm: str,
) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        return payload
    except JWTError:
        raise InvalidTokenException()


def decode_access_token(
    token: str,
    secret_key: str,
    algorithm: str,
) -> Dict[str, Any]:
    payload = decode_token(token, secret_key, algorithm)
    if payload.get("type") != "access":
        raise InvalidTokenException("El token no es un token de acceso valido")
    return payload


def decode_refresh_token(
    token: str,
    secret_key: str,
    algorithm: str,
) -> Dict[str, Any]:
    payload = decode_token(token, secret_key, algorithm)
    if payload.get("type") != "refresh":
        raise InvalidTokenException("El token no es un token de refresco valido")
    return payload


def decode_2fa_temp_token(
    token: str,
    secret_key: str,
    algorithm: str,
) -> Dict[str, Any]:
    payload = decode_token(token, secret_key, algorithm)
    if payload.get("type") != "2fa_temp":
        raise InvalidTokenException("El token temporal de 2FA no es valido")
    return payload


# ── Utilidades ────────────────────────────────────────────────────────────────

def is_token_expired(token: str, secret_key: str, algorithm: str) -> bool:
    try:
        decode_token(token, secret_key, algorithm)
        return False
    except InvalidTokenException:
        return True


def get_token_payload_without_validation(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.get_unverified_claims(token)
    except JWTError:
        return None