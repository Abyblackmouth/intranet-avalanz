from fastapi import APIRouter

router = APIRouter(prefix="/ajustes", tags=["Ajustes"])

@router.get("/")
async def list_ajustes():
    return {"data": [], "message": "Listado de Ajustes"}
