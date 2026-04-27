from pydantic_settings import BaseSettings

class Config(BaseSettings):
    SERVICE_NAME: str = "boveda-service"
    SERVICE_VERSION: str = "1.0.0"
    DATABASE_URL: str = "postgresql+asyncpg://avalanz_user:password@postgres:5432/avalanz_boveda"
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"

    class Config:
        env_file = ".env"

config = Config()
