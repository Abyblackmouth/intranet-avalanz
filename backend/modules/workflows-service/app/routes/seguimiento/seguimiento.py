from fastapi import APIRouter

router = APIRouter(prefix="/seguimiento", tags=["Seguimiento"])

@router.get("/")
async def list_seguimiento():
    return {"data": [], "message": "Listado de Seguimiento"}
