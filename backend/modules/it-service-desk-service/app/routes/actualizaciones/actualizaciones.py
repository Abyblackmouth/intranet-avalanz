from fastapi import APIRouter

router = APIRouter(prefix="/actualizaciones", tags=["Actualizaciones"])

@router.get("/")
async def list_actualizaciones():
    return {"data": [], "message": "Listado de Actualizaciones"}
