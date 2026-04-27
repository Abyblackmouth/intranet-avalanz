from fastapi import APIRouter
from app.routes.boveda import router as boveda_router

router = APIRouter()
router.include_router(boveda_router)
