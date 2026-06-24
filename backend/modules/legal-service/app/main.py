from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import config
from app.routes import router as main_router
from contract_requests.routes import router as contract_requests_router
from contract_requests.docusign_routes import router as docusign_router

from shared.exceptions.http_exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from shared.middleware.cors import setup_cors
from shared.middleware.logging import setup_logging
from shared.middleware.jwt_validator import JWTValidator
from shared.models.responses import HealthResponse


# ── Aplicación ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Legal Service",
    version=config.SERVICE_VERSION,
    docs_url="/docs" if config.DEBUG else None,
    redoc_url="/redoc" if config.DEBUG else None,
)

# ── Métricas Prometheus ───────────────────────────────────────────────────────
Instrumentator().instrument(app).expose(app)

# ── Middlewares ───────────────────────────────────────────────────────────────
setup_logging(app, service_name=config.SERVICE_NAME, log_level=config.LOG_LEVEL, log_format=config.LOG_FORMAT)
setup_cors(app, origins=config.CORS_ORIGINS, allow_credentials=config.CORS_ALLOW_CREDENTIALS, allow_methods=config.CORS_ALLOW_METHODS, allow_headers=config.CORS_ALLOW_HEADERS)

# ── Exception handlers ────────────────────────────────────────────────────────
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# ── Rutas del módulo base ─────────────────────────────────────────────────────
app.include_router(main_router, prefix="/api/v1/legal")

# ── Rutas del submódulo: Solicitud de contratos ───────────────────────────────
app.include_router(contract_requests_router, prefix="/api/v1/legal")
# ── Rutas DocuSign — webhook y polling ────────────────────────────────────────
app.include_router(docusign_router, prefix="/api/v1/legal")

# ── Validador JWT — disponible como dependencia en las rutas ──────────────────
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    """Endpoint de salud para verificación del contenedor."""
    return HealthResponse(
        service=config.SERVICE_NAME,
        version=config.SERVICE_VERSION,
        status="ok",
        dependencies={"database": "postgresql"},
    )