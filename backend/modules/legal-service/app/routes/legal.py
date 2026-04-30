from fastapi import APIRouter

router = APIRouter(prefix="", tags=["Legal"])

@router.get("/")
async def list_items():
    return {"data": [], "message": "Listado de Legal"}
