from fastapi import APIRouter

router = APIRouter(prefix="/reportes", tags=["Reportes"])

@router.get("/")
async def list_reportes():
    return {"data": [], "message": "Listado de Reportes"}
