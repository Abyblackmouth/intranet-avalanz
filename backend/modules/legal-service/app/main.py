from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import config
from app.routes import router as main_router
from contract_requests.routes import router as contract_requests_router

app = FastAPI(
    title="Legal Service",
    version=config.SERVICE_VERSION,
    docs_url="/docs" if True else None,
)

# ── Rutas del módulo base ─────────────────────────────────────────────────────
app.include_router(main_router, prefix="/api/v1/legal")

# ── Rutas del submódulo: Solicitud de contratos ───────────────────────────────
app.include_router(contract_requests_router, prefix="/api/v1/legal")

# ── Métricas Prometheus ───────────────────────────────────────────────────────
Instrumentator().instrument(app).expose(app)


@app.get("/health")
async def health():
    """Endpoint de salud para verificación del contenedor."""
    return {"service": "legal-service", "status": "ok"}