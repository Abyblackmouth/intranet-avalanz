from fastapi import APIRouter

router = APIRouter(prefix="/flujos", tags=["Flujos"])

@router.get("/")
async def list_flujos():
    return {"data": [], "message": "Listado de Flujos"}
