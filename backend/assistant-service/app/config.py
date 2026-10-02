# ----------------------------------------------------------------------
# Importaciones
# pydantic-settings lee las variables de entorno y valida su tipo al
# arrancar el servicio.
# ----------------------------------------------------------------------
from pydantic_settings import BaseSettings, SettingsConfigDict


# ----------------------------------------------------------------------
# Configuracion del servicio
# Las variables criticas no tienen valor por defecto: si falta una, el
# servicio no arranca y el error indica cual. extra="forbid" rechaza
# variables desconocidas cuando se lee un archivo .env, para detectar
# errores de escritura. Toda variable nueva se declara aqui.
# ----------------------------------------------------------------------
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="forbid")

    # Identidad del servicio, usada en salud, logs y metricas
    SERVICE_NAME: str = "assistant-service"
    SERVICE_VERSION: str = "0.1.0"

    # Conexion a la base vectorial (obligatoria)
    DATABASE_URL: str

    # Validacion del JWT de la plataforma (la clave es obligatoria)
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"

    # Carpetas montadas desde el servidor
    SOURCES_PATH: str = "/data/fuentes"
    MODELS_PATH: str = "/data/modelos"


# ----------------------------------------------------------------------
# Instancia unica
# Se importa desde cualquier modulo con: from app.config import settings
# ----------------------------------------------------------------------
settings = Settings()
