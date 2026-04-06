from fastapi import APIRouter

router = APIRouter(prefix="/contratos", tags=["Contratos"])

@router.get("/")
async def list_contratos():
    return {"data": [], "message": "Listado de Contratos"}
