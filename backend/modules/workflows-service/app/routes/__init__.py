from app.routes.segimiento.segimiento import router as segimiento_router
from app.routes.bandeja.bandeja import router as bandeja_router
from fastapi import APIRouter
from app.routes.workflows import router as workflows_router

router = APIRouter()
router.include_router(workflows_router)
router.include_router(bandeja_router)
router.include_router(segimiento_router)
