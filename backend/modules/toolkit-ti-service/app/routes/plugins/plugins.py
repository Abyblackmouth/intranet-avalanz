from fastapi import APIRouter

router = APIRouter(prefix="/plugins", tags=["Plugins"])

@router.get("/")
async def list_plugins():
    return {"data": [], "message": "Listado de Plugins"}
