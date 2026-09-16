from fastapi import APIRouter

router = APIRouter(prefix="/prueba-temporal", tags=["Prueba Temporal"])

@router.get("/")
async def list_prueba_temporal():
    return {"data": [], "message": "Listado de Prueba Temporal"}
