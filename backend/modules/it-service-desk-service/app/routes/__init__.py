from app.routes.prueba_temporal.prueba_temporal import router as prueba_temporal_router
from fastapi import APIRouter
from app.routes.it_service_desk import router as it_service_desk_router
from app.routes.mesa_de_soporte.mesa_de_soporte import router as mesa_de_soporte_router
from app.routes.actualizaciones.actualizaciones import router as actualizaciones_router

router = APIRouter()
router.include_router(it_service_desk_router)
router.include_router(mesa_de_soporte_router)
router.include_router(actualizaciones_router)
router.include_router(prueba_temporal_router)
