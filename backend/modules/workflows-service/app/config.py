from pydantic_settings import BaseSettings


class Config(BaseSettings):
    """Toda variable del .env se declara aqui (pydantic-settings no acepta desconocidas)."""
    SERVICE_NAME: str = "workflows-service"
    SERVICE_VERSION: str = "1.0.0"
    DATABASE_URL: str = "postgresql+asyncpg://avalanz_user:password@postgres:5432/avalanz_workflows"
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    RABBITMQ_URL: str = "amqp://guest:guest@rabbitmq:5672/"
    FRONTEND_URL: str = "http://localhost:3000"
    # Cifra los secretos de las conexiones (contrasenas, tokens). Propia del modulo.
    FERNET_KEY: str = ""
    # Servicios base (nombre del contenedor + puerto, siempre)
    ADMIN_SERVICE_URL: str = "http://admin-service:8000"
    EMAIL_SERVICE_URL: str = "http://email-service:8000"
    NOTIFY_SERVICE_URL: str = "http://notify-service:8000"
    WEBSOCKET_SERVICE_URL: str = "http://websocket-service:8000"
    UPLOAD_SERVICE_URL: str = "http://upload-service:8000"
    # MinIO directo (boto3) para los archivos que llegan en el sobre (sin JWT de usuario)
    MINIO_ENDPOINT: str = ""
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET: str = "dirdoc"
    MINIO_SECURE: bool = False
    # Direccion publica de MinIO para las ligas firmadas (la misma que SIGNED_URL_HOST del upload-service)
    MINIO_PUBLIC_URL: str = ""
    # Barrido de la bandeja de salida (segundos)
    OUTBOX_SWEEP_SECONDS: int = 60

    class Config:
        env_file = ".env"


config = Config()
