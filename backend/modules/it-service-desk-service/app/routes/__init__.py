from fastapi import APIRouter
from app.routes.it_service_desk import router as it_service_desk_router

router = APIRouter()
router.include_router(it_service_desk_router)
