import logging

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_fastapi_instrumentator import metrics as _metricas

from app.config import config
from app.routes import router as main_router

logger = logging.getLogger("avalanz")

app = FastAPI(title="Workflows Service", version=config.SERVICE_VERSION)

# Metricas para Prometheus: expone GET /metrics (solo red interna de Docker).
# Mismas cubetas que el IT Service Desk; /metrics y /health no se cuentan.
Instrumentator(excluded_handlers=["/metrics", "/health"]).add(
    _metricas.default(latency_lowr_buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10))
).instrument(app).expose(app)

app.include_router(main_router, prefix="/api/v1/workflows")

# El consumidor de RabbitMQ (bandeja de salida hacia las plataformas) se
# arranca en el evento startup cuando exista (paso 5 del plan de construccion).


@app.get("/health")
async def health():
    return {"service": config.SERVICE_NAME, "status": "ok"}
