from fastapi import APIRouter

router = APIRouter(prefix="/bandeja", tags=["Bandeja"])

@router.get("/")
async def list_bandeja():
    return {"data": [], "message": "Listado de Bandeja"}
