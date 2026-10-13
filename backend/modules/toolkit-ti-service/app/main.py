from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import config
from app.routes import router as main_router
from app.services.plugins.plugins_service import limpiar_colgadas


@asynccontextmanager
async def ciclo(app: FastAPI):
    try:
        await limpiar_colgadas()      # ejecuciones que quedaron a medias por un reinicio
    except Exception:
        pass
    yield


app = FastAPI(title="Toolkit TI Service", version="1.0.0", lifespan=ciclo)

from prometheus_fastapi_instrumentator import metrics as _metricas
# Cubetas finas: con las de fabrica (la mas chica de 100 ms) el p95 siempre salia ~100 ms.
# /metrics y /health no son peticiones de usuarios: no se cuentan.
Instrumentator(excluded_handlers=["/metrics", "/health"]).add(
    _metricas.default(latency_lowr_buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10))
).instrument(app).expose(app)

app.include_router(main_router, prefix="/api/v1/toolkit-ti")


@app.get("/health")
async def health():
    return {"service": "toolkit-ti-service", "status": "ok"}
