from pydantic_settings import BaseSettings
from typing import List


class Config(BaseSettings):
    SERVICE_NAME: str = "legal-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    DATABASE_URL: str = "postgresql+asyncpg://avalanz_user:password@postgres:5432/avalanz_legal"
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    CORS_ORIGINS: List[str] = ["https://intranet.avalanz.com"]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    class Config:
        env_file = ".env"
        extra = "ignore"


config = Config()
