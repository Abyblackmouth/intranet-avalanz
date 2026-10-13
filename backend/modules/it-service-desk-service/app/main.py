from prometheus_fastapi_instrumentator import Instrumentator
import asyncio
import logging

from fastapi import FastAPI
from app.config import config
from app.routes import router as main_router
from app.rabbitmq import start_consumer

logger = logging.getLogger("avalanz")

app = FastAPI(title="It Service Desk Service", version="1.0.0")

# Metricas para Prometheus: expone GET /metrics (solo red interna de Docker)
from prometheus_fastapi_instrumentator import metrics as _metricas
# Cubetas finas: con las de fabrica (la mas chica de 100 ms) el p95 siempre salia ~100 ms.
# /metrics y /health no son peticiones de usuarios: no se cuentan.
Instrumentator(excluded_handlers=["/metrics", "/health"]).add(
    _metricas.default(latency_lowr_buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10))
).instrument(app).expose(app)

app.include_router(main_router, prefix="/api/v1/it-service-desk")


@app.on_event("startup")
async def startup_event():
    async def _run_consumer_forever():
        while True:
            try:
                await start_consumer()
            except Exception:
                logger.exception("Consumidor del motor de asignacion se cayo, reintentando en 5s...")
                await asyncio.sleep(5)

    asyncio.create_task(_run_consumer_forever())


@app.get("/health")
async def health():
    return {"service": "it-service-desk-service", "status": "ok"}
