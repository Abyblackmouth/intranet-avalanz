from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import config
from app.routes import router as main_router
from app.services.plugins.plugins_service import limpiar_colgadas


@asynccontextmanager
async def ciclo(app: FastAPI):
    try:
        await limpiar_colgadas()      # ejecuciones que quedaron a medias por un reinicio
    except Exception:
        pass
    yield


app = FastAPI(title="Toolkit TI Service", version="1.0.0", lifespan=ciclo)

app.include_router(main_router, prefix="/api/v1/toolkit-ti")


@app.get("/health")
async def health():
    return {"service": "toolkit-ti-service", "status": "ok"}
