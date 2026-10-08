from app.routes.ajustes.ajustes import router as ajustes_router
from fastapi import APIRouter
from app.routes.it_service_desk import router as it_service_desk_router
from app.routes.mesa_de_soporte.mesa_de_soporte import router as mesa_de_soporte_router
from app.routes.actualizaciones.actualizaciones import router as actualizaciones_router
from app.routes.control_cambios.control_cambios import router as control_cambios_router

router = APIRouter()
router.include_router(it_service_desk_router)
router.include_router(mesa_de_soporte_router)
from app.routes.actualizaciones.comunicados import admin_router as comunicados_admin_router, publico_router as comunicados_router
router.include_router(comunicados_admin_router)   # antes que actualizaciones, para que ninguna ruta suya lo tape
router.include_router(comunicados_router)
router.include_router(actualizaciones_router)
router.include_router(control_cambios_router)
router.include_router(ajustes_router)

# Control de accesos: configuracion de formatos (Actualizaciones)
from app.routes.control_accesos.configuracion import router as acc_config_router
router.include_router(acc_config_router)

# Control de accesos: formulario del solicitante
from app.routes.control_accesos.solicitudes import router as acc_solicitudes_router
router.include_router(acc_solicitudes_router)
