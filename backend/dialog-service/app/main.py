# ----------------------------------------------------------------------
# Aplicacion del dialog-service
# Al arrancar carga intenciones y tipos de ticket, y abre los clientes
# HTTP hacia el conocimiento (assistant-service) y la mesa de servicio
# (IT Service Desk); al apagar los cierra.
# ----------------------------------------------------------------------
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.adapters.assistant_client import HttpKnowledgeClient
from app.adapters.rule_intents import RuleIntentDetector
from app.adapters.service_desk_client import HttpServiceDeskClient
from app.adapters.ticket_classifier import KeywordTicketClassifier
from app.api.dialog import router as dialog_router
from app.api.health import router as health_router
from app.api.ticket import router as ticket_router
from app.application.handle_message import HandleMessage
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    knowledge_http = httpx.AsyncClient(base_url=settings.ASSISTANT_URL, timeout=settings.ASSISTANT_TIMEOUT_SECONDS)
    desk_http = httpx.AsyncClient(base_url=settings.SERVICE_DESK_URL, timeout=60.0)
    detector = RuleIntentDetector.from_file(settings.INTENTS_PATH)
    app.state.http = knowledge_http
    app.state.detector = detector
    app.state.handler = HandleMessage(detector, HttpKnowledgeClient(knowledge_http))
    app.state.classifier = KeywordTicketClassifier.from_file(settings.TICKET_TYPES_PATH)
    app.state.service_desk = HttpServiceDeskClient(desk_http, settings.SERVICE_DESK_CATALOG_BASE)
    yield
    await knowledge_http.aclose()
    await desk_http.aclose()


app = FastAPI(title="Avalanz Dialog Service", version=settings.SERVICE_VERSION, lifespan=lifespan)
Instrumentator().instrument(app).expose(app)
app.include_router(health_router)
app.include_router(dialog_router, prefix="/api/v1/dialog")
app.include_router(ticket_router, prefix="/api/v1/dialog")
