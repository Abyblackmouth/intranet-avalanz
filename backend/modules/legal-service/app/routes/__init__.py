from fastapi import APIRouter
from app.routes.legal import router as legal_router

router = APIRouter()
router.include_router(legal_router)
