# ----------------------------------------------------------------------
# Importaciones
# FastAPI para las rutas, SQLAlchemy para consultar la base y Path para
# revisar que las carpetas montadas existan.
# ----------------------------------------------------------------------
import logging
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session

logger = logging.getLogger("assistant")
router = APIRouter(tags=["salud"])


# ----------------------------------------------------------------------
# Liveness: el proceso esta vivo
# Responde sin consultar nada externo. Es la misma ruta /health que usan
# los demas servicios de la plataforma.
# ----------------------------------------------------------------------
@router.get("/health")
async def liveness() -> dict:
    return {"service": settings.SERVICE_NAME, "status": "ok"}


# ----------------------------------------------------------------------
# Readiness: el servicio puede trabajar
# Revisa la base de datos, la extension pgvector y las carpetas montadas.
# Responde 503 si algo falla, indicando que revision no paso.
# ----------------------------------------------------------------------
@router.get("/health/ready")
async def readiness(session: AsyncSession = Depends(get_session)) -> JSONResponse:
    checks: dict[str, str] = {}

    # Base de datos y version de pgvector
    try:
        result = await session.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        )
        version = result.scalar_one_or_none()
        checks["database"] = "ok"
        checks["pgvector"] = version or "no_instalado"
    except Exception:
        logger.exception("Readiness: fallo la consulta a la base vectorial")
        checks["database"] = "error"
        checks["pgvector"] = "desconocido"

    # Carpetas montadas desde el servidor
    checks["fuentes"] = "ok" if Path(settings.SOURCES_PATH).is_dir() else "no_montada"
    checks["modelos"] = "ok" if Path(settings.MODELS_PATH).is_dir() else "no_montada"
    checks["modelo"] = "ok" if (Path(settings.MODELS_PATH) / "e5-small" / "model.onnx").is_file() else "no_encontrado"

    # Listo solo si todas las revisiones pasaron
    ready = (
        checks["database"] == "ok"
        and checks["pgvector"] not in ("no_instalado", "desconocido")
        and checks["fuentes"] == "ok"
        and checks["modelos"] == "ok"
        and checks["modelo"] == "ok"
    )
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ok" if ready else "unavailable", "checks": checks},
    )
