from fastapi import APIRouter
from app.routes.it_service_desk import router as it_service_desk_router
from app.routes.mesa_de_soporte.mesa_de_soporte import router as mesa_de_soporte_router
from app.routes.actualizaciones.actualizaciones import router as actualizaciones_router
from app.routes.control_cambios.control_cambios import router as control_cambios_router

router = APIRouter()
router.include_router(it_service_desk_router)
router.include_router(mesa_de_soporte_router)
router.include_router(actualizaciones_router)
router.include_router(control_cambios_router)
