from fastapi import APIRouter

router = APIRouter(prefix="/segimiento", tags=["Segimiento"])

@router.get("/")
async def list_segimiento():
    return {"data": [], "message": "Listado de Segimiento"}
