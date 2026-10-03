# ----------------------------------------------------------------------
# Salud en dos niveles
# /health: el proceso vive. /health/ready: intenciones cargadas y el
# servicio de conocimiento responde; si no, 503 con el detalle.
# ----------------------------------------------------------------------
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import settings

router = APIRouter(tags=["salud"])


@router.get("/health")
async def health() -> dict:
    return {"service": settings.SERVICE_NAME, "status": "ok"}


@router.get("/health/ready")
async def ready(request: Request) -> JSONResponse:
    checks = {"intenciones": request.app.state.detector.size}
    try:
        response = await request.app.state.http.get("/health", timeout=3)
        checks["conocimiento"] = "ok" if response.status_code == 200 else f"http_{response.status_code}"
    except Exception:
        checks["conocimiento"] = "sin_respuesta"
    ok = checks["intenciones"] > 0 and checks["conocimiento"] == "ok"
    return JSONResponse({"status": "ok" if ok else "error", "checks": checks}, status_code=200 if ok else 503)
