# ----------------------------------------------------------------------
# Aplicacion del dialog-service
# Al arrancar carga las intenciones y abre el cliente HTTP hacia el
# servicio de conocimiento; al apagar lo cierra.
# ----------------------------------------------------------------------
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.adapters.assistant_client import HttpKnowledgeClient
from app.adapters.rule_intents import RuleIntentDetector
from app.api.dialog import router as dialog_router
from app.api.health import router as health_router
from app.application.handle_message import HandleMessage
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = httpx.AsyncClient(base_url=settings.ASSISTANT_URL, timeout=settings.ASSISTANT_TIMEOUT_SECONDS)
    detector = RuleIntentDetector.from_file(settings.INTENTS_PATH)
    app.state.http = client
    app.state.detector = detector
    app.state.handler = HandleMessage(detector, HttpKnowledgeClient(client))
    yield
    await client.aclose()


app = FastAPI(title="Avalanz Dialog Service", version=settings.SERVICE_VERSION, lifespan=lifespan)
Instrumentator().instrument(app).expose(app)
app.include_router(health_router)
app.include_router(dialog_router, prefix="/api/v1/dialog")
