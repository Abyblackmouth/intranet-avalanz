from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.config import config
from app.database import init_db, close_db
from app.routes.auth import router as auth_router
from app.routes.twofa import router as twofa_router

from shared.exceptions.http_exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from shared.middleware.cors import setup_cors
from shared.middleware.rate_limit import setup_rate_limit
from shared.middleware.logging import setup_logging
from shared.models.responses import HealthResponse


# ── Ciclo de vida ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


# ── Aplicacion ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Avalanz Auth Service",
    description="Servicio de autenticacion centralizada con JWT y 2FA condicional",
    version=config.SERVICE_VERSION,
    docs_url="/docs" if config.DEBUG else None,
    redoc_url="/redoc" if config.DEBUG else None,
    lifespan=lifespan,
)


# ── Middlewares ───────────────────────────────────────────────────────────────

setup_logging(app, service_name=config.SERVICE_NAME, log_level=config.LOG_LEVEL, log_format=config.LOG_FORMAT)
setup_cors(app, origins=config.CORS_ORIGINS, allow_credentials=config.CORS_ALLOW_CREDENTIALS, allow_methods=config.CORS_ALLOW_METHODS, allow_headers=config.CORS_ALLOW_HEADERS)
setup_rate_limit(app, max_requests=config.RATE_LIMIT_REQUESTS, window_seconds=config.RATE_LIMIT_WINDOW_SECONDS)


# ── Exception handlers ────────────────────────────────────────────────────────

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth_router, prefix="/api/v1")
app.include_router(twofa_router, prefix="/api/v1")


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    return HealthResponse(
        service=config.SERVICE_NAME,
        version=config.SERVICE_VERSION,
        status="ok",
        dependencies={
            "database": "postgresql",
            "cache": "redis",
        },
    )