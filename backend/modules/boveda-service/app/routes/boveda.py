from fastapi import APIRouter

router = APIRouter(prefix="", tags=["Boveda"])

@router.get("/")
async def list_items():
    return {"data": [], "message": "Listado de Boveda"}
