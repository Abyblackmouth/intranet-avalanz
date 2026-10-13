from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    # Tolera variables que no use (como los demas servicios), en lugar de rechazarlas
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVICE_NAME: str = "toolkit-ti-service"
    SERVICE_VERSION: str = "1.0.0"
    DATABASE_URL: str = ""
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    RABBITMQ_URL: str = ""
    FRONTEND_URL: str = "https://intranet.avalanz.com"
    MINIO_ENDPOINT: str = ""
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""


config = Config()
