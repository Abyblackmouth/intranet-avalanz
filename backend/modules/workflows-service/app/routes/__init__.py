from fastapi import APIRouter
from app.routes.workflows import router as workflows_router

router = APIRouter()
router.include_router(workflows_router)
