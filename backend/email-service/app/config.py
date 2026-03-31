from functools import lru_cache
from shared.config.base_config import BaseConfig


class EmailConfig(BaseConfig):

    # ── Identificacion del servicio ───────────────────────────────────────────
    SERVICE_NAME: str = "email-service"
    SERVICE_VERSION: str = "1.0.0"

    # ── SMTP ──────────────────────────────────────────────────────────────────
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False

    # ── Remitente ─────────────────────────────────────────────────────────────
    EMAIL_FROM_NAME: str = "Avalanz"
    EMAIL_FROM_ADDRESS: str = "noreply@avalanz.com"

    # ── Frontend base URL (para links en los correos) ─────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_config() -> EmailConfig:
    return EmailConfig()


config = get_config()