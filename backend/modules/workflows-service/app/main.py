import asyncio
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


@app.on_event("startup")
async def startup_event():
    """Consumidor de la cola de resultados y barrido periodico de la bandeja de salida.
    Si RabbitMQ se cae, el consumidor reintenta; el barrido sigue solo con la base."""
    from app.rabbitmq import start_consumer, barrido_periodico

    async def _consumidor():
        while True:
            try:
                await start_consumer()
            except Exception:
                logger.exception("Consumidor de resultados se cayó, reintentando en 5 s...")
                await asyncio.sleep(5)

    asyncio.create_task(_consumidor())
    asyncio.create_task(barrido_periodico(config.OUTBOX_SWEEP_SECONDS))


@app.get("/health")
async def health():
    return {"service": config.SERVICE_NAME, "status": "ok"}
