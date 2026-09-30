import asyncio
import logging

from fastapi import FastAPI
from app.config import config
from app.routes import router as main_router
from app.rabbitmq import start_consumer

logger = logging.getLogger("avalanz")

app = FastAPI(title="It Service Desk Service", version="1.0.0")

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
