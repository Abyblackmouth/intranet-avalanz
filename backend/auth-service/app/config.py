from functools import lru_cache
from shared.config.base_config import BaseConfig


class AuthConfig(BaseConfig):

    # ── Identificacion del servicio ───────────────────────────────────────────
    SERVICE_NAME: str = "auth-service"
    SERVICE_VERSION: str = "1.0.0"

    # ── Base de datos propia del servicio ─────────────────────────────────────
    DB_NAME: str = "avalanz_auth"

    # ── TOTP (Google / Microsoft Authenticator) ───────────────────────────────
    TOTP_ISSUER: str = "Avalanz"
    TOTP_ALGORITHM: str = "SHA1"
    TOTP_DIGITS: int = 6
    TOTP_INTERVAL: int = 30

    # ── Bloqueo de cuenta por intentos fallidos ───────────────────────────────
    MAX_FAILED_ATTEMPTS: int = 3
    ACCOUNT_LOCKOUT_NOTIFY_ADMIN: bool = True

    # ── Contrasena temporal ───────────────────────────────────────────────────
    TEMP_PASSWORD_EXPIRE_HOURS: int = 24

    # ── Recuperacion de contrasena ────────────────────────────────────────────
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30
    PASSWORD_RESET_BASE_URL: str = "http://localhost:3000/reset-password"

    # ── Sesiones ──────────────────────────────────────────────────────────────
    MAX_ACTIVE_SESSIONS: int = 3

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_config() -> AuthConfig:
    return AuthConfig()


config = get_config()