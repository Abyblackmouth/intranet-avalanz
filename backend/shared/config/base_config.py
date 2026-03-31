from pydantic_settings import BaseSettings
from typing import List


class BaseConfig(BaseSettings):

    # ── Entorno ──────────────────────────────────────────────────────────────
    ENV: str = "development"
    DEBUG: bool = False
    SERVICE_NAME: str = "base-service"
    SERVICE_VERSION: str = "1.0.0"

    # ── Base de datos ─────────────────────────────────────────────────────────
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = ""
    DB_USER: str = ""
    DB_PASSWORD: str = ""

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0

    @property
    def REDIS_URL(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # ── RabbitMQ ──────────────────────────────────────────────────────────────
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USER: str = "guest"
    RABBITMQ_PASSWORD: str = "guest"
    RABBITMQ_VHOST: str = "/"

    @property
    def RABBITMQ_URL(self) -> str:
        return (
            f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}"
            f"@{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}/{self.RABBITMQ_VHOST}"
        )

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_INACTIVITY_EXPIRE_MINUTES: int = 30
    JWT_ABSOLUTE_EXPIRE_HOURS: int = 8
    JWT_2FA_TEMP_EXPIRE_MINUTES: int = 15

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = ["*"]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ── Almacenamiento S3 / MinIO ─────────────────────────────────────────────
    STORAGE_ENDPOINT: str = "http://localhost:9000"
    STORAGE_ACCESS_KEY: str = ""
    STORAGE_SECRET_KEY: str = ""
    STORAGE_BUCKET_DEFAULT: str = "avalanz"
    STORAGE_USE_SSL: bool = False

    # ── Redes corporativas (2FA condicional) ──────────────────────────────────
    CORPORATE_IP_RANGES: List[str] = ["192.168.0.0/16", "10.0.0.0/8"]

    # ── Consul ────────────────────────────────────────────────────────────────
    CONSUL_HOST: str = "localhost"
    CONSUL_PORT: int = 8500

    # ── Logs ──────────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "allow"