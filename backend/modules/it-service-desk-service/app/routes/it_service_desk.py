from fastapi import APIRouter

router = APIRouter(prefix="", tags=["It Service Desk"])

@router.get("/")
async def list_items():
    return {"data": [], "message": "Listado de It Service Desk"}
