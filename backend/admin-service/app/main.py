from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.database import init_db, close_db, get_db
from app.routes.users import router as users_router
from app.routes.modules import router as modules_router
from app.routes.roles import router as roles_router
from app.routes.permissions import router as permissions_router
from app.routes.groups import router as groups_router
from app.routes.companies import router as companies_router
from app.routes.user_files import router as user_files_router

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
from shared.middleware.jwt_validator import JWTValidator
from shared.models.responses import HealthResponse
from prometheus_fastapi_instrumentator import Instrumentator


# ── Ciclo de vida ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


# ── Aplicacion ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Avalanz Admin Service",
    description="Servicio de administracion centralizada de usuarios, modulos, roles y permisos",
    version=config.SERVICE_VERSION,
    docs_url="/docs" if config.DEBUG else None,
    redoc_url="/redoc" if config.DEBUG else None,
    lifespan=lifespan,
)


# ── Metricas Prometheus ──────────────────────────────────────────────────────
Instrumentator().instrument(app).expose(app)
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

app.include_router(users_router, prefix="/api/v1")
app.include_router(modules_router, prefix="/api/v1")
app.include_router(roles_router, prefix="/api/v1")
app.include_router(permissions_router, prefix="/api/v1")
app.include_router(groups_router, prefix="/api/v1")
app.include_router(companies_router, prefix="/api/v1")
app.include_router(user_files_router, prefix="/api/v1")


# ── Endpoint interno para auth-service ───────────────────────────────────────

validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)

from app.services.user_service import get_user_permissions

@app.get("/internal/users/{user_id}/permissions", include_in_schema=False)
async def internal_get_user_permissions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await get_user_permissions(db=db, user_id=user_id)
    return result


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