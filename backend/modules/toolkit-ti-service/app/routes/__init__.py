from fastapi import APIRouter
from app.routes.toolkit_ti import router as toolkit_ti_router

router = APIRouter()
router.include_router(toolkit_ti_router)
