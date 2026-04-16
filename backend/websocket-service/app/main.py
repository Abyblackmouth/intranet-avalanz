from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.config import config
from app.routes.ws import router as ws_router

from shared.exceptions.http_exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from shared.middleware.cors import setup_cors
from shared.middleware.logging import setup_logging
from prometheus_fastapi_instrumentator import Instrumentator
setup_logging
from shared.models.responses import HealthResponse


app = FastAPI(
    title="Avalanz WebSocket Service",
    description="Servicio de comunicacion bidireccional en tiempo real",
    version=config.SERVICE_VERSION,
    docs_url="/docs" if config.DEBUG else None,
    redoc_url="/redoc" if config.DEBUG else None,
)

Instrumentator().instrument(app).expose(app)
setup_logging(app, service_name=config.SERVICE_NAME, log_level=config.LOG_LEVEL, log_format=config.LOG_FORMAT)
setup_cors(app, origins=config.CORS_ORIGINS, allow_credentials=config.CORS_ALLOW_CREDENTIALS, allow_methods=config.CORS_ALLOW_METHODS, allow_headers=config.CORS_ALLOW_HEADERS)

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(ws_router)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    return HealthResponse(
        service=config.SERVICE_NAME,
        version=config.SERVICE_VERSION,
        status="ok",
        dependencies={
            "connections": len(str(__import__("app.services.ws_service", fromlist=["manager"]).manager.get_online_users())),
        },
    )