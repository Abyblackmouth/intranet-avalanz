from fastapi import APIRouter

router = APIRouter(prefix="/proveedores", tags=["Proveedores"])

@router.get("/")
async def list_proveedores():
    return {"data": [], "message": "Listado de Proveedores"}
