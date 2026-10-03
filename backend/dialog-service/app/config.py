# ----------------------------------------------------------------------
# Configuracion del dialog-service
# Las variables criticas no tienen valor por defecto: si falta una, el
# servicio no arranca. extra="forbid" rechaza variables desconocidas.
# ----------------------------------------------------------------------
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="forbid")

    # Identidad del servicio
    SERVICE_NAME: str = "dialog-service"
    SERVICE_VERSION: str = "0.1.0"

    # Validacion del JWT de la plataforma (la clave es obligatoria)
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"

    # Servicio de conocimiento (RAG) y tiempo maximo de espera
    ASSISTANT_URL: str = "http://avalanz-assistant:8000"
    ASSISTANT_TIMEOUT_SECONDS: float = 30.0

    # Archivo de intenciones de platica basica
    INTENTS_PATH: str = "data/intents.yaml"


settings = Settings()
