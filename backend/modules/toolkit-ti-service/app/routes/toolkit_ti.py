from fastapi import APIRouter

router = APIRouter(prefix="", tags=["Toolkit Ti"])

@router.get("/")
async def list_items():
    return {"data": [], "message": "Listado de Toolkit Ti"}
