from fastapi import APIRouter

router = APIRouter(prefix="/mesa-de-soporte", tags=["Mesa De Soporte"])

@router.get("/")
async def list_mesa_de_soporte():
    return {"data": [], "message": "Listado de Mesa De Soporte"}
