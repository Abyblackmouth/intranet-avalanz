from fastapi import APIRouter

from app.routes.workflows import router as workflows_router
from app.routes.ajustes.ajustes import router as ajustes_router
from app.routes.flujos.flujos import router as flujos_router
from app.routes.bandeja.bandeja import router as bandeja_router
from app.routes.seguimiento.seguimiento import router as seguimiento_router
from app.routes.integration.integration import router as integration_router
from app.routes.publico.publico import router as publico_router

router = APIRouter()
router.include_router(workflows_router)
router.include_router(ajustes_router)
router.include_router(flujos_router)
router.include_router(bandeja_router)
router.include_router(seguimiento_router)
router.include_router(integration_router)
router.include_router(publico_router)
