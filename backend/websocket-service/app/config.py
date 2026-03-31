from functools import lru_cache
from shared.config.base_config import BaseConfig


class WebSocketConfig(BaseConfig):

    # ── Identificacion del servicio ───────────────────────────────────────────
    SERVICE_NAME: str = "websocket-service"
    SERVICE_VERSION: str = "1.0.0"

    # ── WebSocket ─────────────────────────────────────────────────────────────
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MAX_CONNECTIONS_PER_USER: int = 5

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_config() -> WebSocketConfig:
    return WebSocketConfig()


config = get_config()