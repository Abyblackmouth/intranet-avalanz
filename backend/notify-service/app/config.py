from functools import lru_cache
from shared.config.base_config import BaseConfig


class NotifyConfig(BaseConfig):

    # ── Identificacion del servicio ───────────────────────────────────────────
    SERVICE_NAME: str = "notify-service"
    SERVICE_VERSION: str = "1.0.0"

    # ── Base de datos propia del servicio ─────────────────────────────────────
    DB_NAME: str = "avalanz_notify"

    # ── Paginacion ────────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_config() -> NotifyConfig:
    return NotifyConfig()


config = get_config()