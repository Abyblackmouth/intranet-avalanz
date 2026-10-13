from app.routes.proveedores.proveedores import router as proveedores_router
from app.routes.plugins.plugins import router as plugins_router
from fastapi import APIRouter
from app.routes.toolkit_ti import router as toolkit_ti_router

router = APIRouter()
router.include_router(toolkit_ti_router)
router.include_router(plugins_router)
router.include_router(proveedores_router)
