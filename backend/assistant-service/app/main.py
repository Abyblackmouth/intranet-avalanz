# ----------------------------------------------------------------------
# Importaciones
# FastAPI para la aplicacion, Instrumentator para las metricas de
# Prometheus, y las rutas y el motor de base de datos del servicio.
# ----------------------------------------------------------------------
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.health import router as health_router
from app.api.search import router as search_router
from app.composition import build_components
from app.config import settings
from app.database import engine


# ----------------------------------------------------------------------
# Ciclo de vida
# Al apagar el servicio se cierran las conexiones a la base de datos de
# forma ordenada, sin dejar conexiones colgadas en PostgreSQL.
# ----------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.components = await build_components(engine)
    yield
    await engine.dispose()


# ----------------------------------------------------------------------
# Aplicacion
# La documentacion interactiva (/docs) queda desactivada, igual que en
# los demas servicios de produccion.
# ----------------------------------------------------------------------
app = FastAPI(
    title="Assistant Service",
    version=settings.SERVICE_VERSION,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


# ----------------------------------------------------------------------
# Metricas
# Expone GET /metrics para Prometheus (solo red interna de Docker).
# ----------------------------------------------------------------------
Instrumentator().instrument(app).expose(app)


# ----------------------------------------------------------------------
# Rutas
# Salud en la raiz. Las rutas del asistente se registraran bajo el
# prefijo /api/v1/assistant conforme se construya cada fase.
# ----------------------------------------------------------------------
app.include_router(health_router)
app.include_router(search_router, prefix="/api/v1/assistant")
