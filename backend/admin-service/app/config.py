from functools import lru_cache
from shared.config.base_config import BaseConfig


class AdminConfig(BaseConfig):

    # ── Identificacion del servicio ───────────────────────────────────────────
    SERVICE_NAME: str = "admin-service"
    SERVICE_VERSION: str = "1.0.0"

    # ── Base de datos propia del servicio ─────────────────────────────────────
    DB_NAME: str = "avalanz_admin"

    # ── Contrasena temporal para usuarios nuevos ──────────────────────────────
    TEMP_PASSWORD_LENGTH: int = 12
    TEMP_PASSWORD_EXPIRE_HOURS: int = 24

    # ── Paginacion por defecto ────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_config() -> AdminConfig:
    return AdminConfig()


config = get_config()