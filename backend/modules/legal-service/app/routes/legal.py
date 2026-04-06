from fastapi import APIRouter

router = APIRouter(prefix="/legal", tags=["Legal"])

@router.get("/")
async def list_items():
    return {"data": [], "message": "Listado de Legal"}
