# ----------------------------------------------------------------------
# Rutas del ticket desde el chat
#   GET  /api/v1/dialog/ticket/catalogs  sistemas, modulos y severidades
#   POST /api/v1/dialog/ticket/suggest   sugerencia de funcional o tecnico
#   POST /api/v1/dialog/ticket           alta con hasta 3 imagenes
# Requieren sesion y el modulo it-service-desk en el token.
# ----------------------------------------------------------------------
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from prometheus_client import Counter
from pydantic import BaseModel, Field

from app.api.dialog import validator
from app.domain.models import KnowledgeUnavailable

router = APIRouter(tags=["tickets"])
TICKETS = Counter("dialog_tickets_total", "Tickets creados desde el chat", ["reported_type"])

# Limites de las capturas de pantalla
MAX_FILES = 3
MAX_BYTES = 5 * 1024 * 1024
DESK_MODULE = "it-service-desk"


def _require_desk(user: dict) -> None:
    modules = {m.get("slug") for m in user.get("modules", []) if isinstance(m, dict)}
    if not user.get("is_super_admin") and DESK_MODULE not in modules:
        raise HTTPException(status_code=403, detail="sin_acceso_al_modulo")


@router.get("/ticket/catalogs")
async def catalogs(request: Request, user: dict = Depends(validator.get_current_user())) -> dict:
    _require_desk(user)
    try:
        return await request.app.state.service_desk.catalogs(request.headers.get("authorization", ""))
    except KnowledgeUnavailable as error:
        raise HTTPException(status_code=error.status, detail=error.detail) from error


class SuggestRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    topics: list[str] = Field(default_factory=list, max_length=20)


@router.post("/ticket/suggest")
async def suggest(body: SuggestRequest, request: Request, user: dict = Depends(validator.get_current_user())) -> dict:
    _require_desk(user)
    return request.app.state.classifier.suggest(body.text, body.topics)


@router.post("/ticket")
async def create_ticket(
    request: Request,
    title: str = Form(..., min_length=1, max_length=150),
    description: str = Form(..., min_length=1, max_length=5000),
    system_id: str = Form(...),
    module_id: str | None = Form(None),
    reported_type: str = Form(...),
    severity_reported_id: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    user: dict = Depends(validator.get_current_user()),
) -> dict:
    _require_desk(user)
    if reported_type not in ("funcional", "tecnico"):
        raise HTTPException(status_code=422, detail="tipo_invalido")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=422, detail="maximo_3_imagenes")
    uploads = []
    for upload in files:
        if not (upload.content_type or "").startswith("image/"):
            raise HTTPException(status_code=422, detail="solo_imagenes")
        content = await upload.read()
        if len(content) > MAX_BYTES:
            raise HTTPException(status_code=422, detail="imagen_mayor_a_5mb")
        uploads.append((upload.filename or "captura.png", content, upload.content_type))
    fields = {"title": title.strip(), "description": description.strip(), "system_id": system_id,
              "module_id": module_id, "reported_type": reported_type, "severity_reported_id": severity_reported_id}
    try:
        data = await request.app.state.service_desk.create_incident(fields, uploads, request.headers.get("authorization", ""))
    except KnowledgeUnavailable as error:
        raise HTTPException(status_code=error.status, detail=error.detail) from error
    TICKETS.labels(reported_type).inc()
    return {"id": str(data.get("id")), "folio": data.get("folio"), "status": data.get("status")}
