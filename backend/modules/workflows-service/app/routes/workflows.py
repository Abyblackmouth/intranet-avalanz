from fastapi import APIRouter

router = APIRouter(prefix="", tags=["Workflows"])

@router.get("/")
async def list_items():
    return {"data": [], "message": "Listado de Workflows"}
