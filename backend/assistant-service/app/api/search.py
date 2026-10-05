# ----------------------------------------------------------------------
# Rutas del asistente: busqueda y disponibilidad
# Ambas requieren sesion (JWT de la plataforma). El usuario debe tener el
# modulo en su token (o ser super admin) y el asistente debe estar activo
# para el en ese modulo; si no, 403.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.application.privacy import mask_participants
from app.config import settings
from app.domain.models import BlockKind
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(tags=["asistente"])
validator = JWTValidator(secret_key=settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ----------------------------------------------------------------------
# Peticion de busqueda
# ----------------------------------------------------------------------
class SearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    module: str = Field(min_length=1, max_length=100)


# ----------------------------------------------------------------------
# Modulos del token y regla de acceso
# ----------------------------------------------------------------------
def _user_modules(user: dict) -> set[str]:
    return {m.get("slug") for m in user.get("modules", []) if isinstance(m, dict)}


async def _check_access(request: Request, user: dict, module: str) -> None:
    if not user.get("is_super_admin") and module not in _user_modules(user):
        raise HTTPException(status_code=403, detail="sin_acceso_al_modulo")
    if not await request.app.state.components.activation.is_available(module, user.get("email", "")):
        raise HTTPException(status_code=403, detail="asistente_no_disponible")


# ----------------------------------------------------------------------
# Disponibilidad: el widget la consulta para decidir si aparece
# ----------------------------------------------------------------------
@router.get("/availability")
async def availability(request: Request, module: str = Query(..., max_length=100),
                       user: dict = Depends(validator.get_current_user())) -> dict:
    try:
        await _check_access(request, user, module)
    except HTTPException:
        return {"module": module, "available": False}
    return {"module": module, "available": True}


# ----------------------------------------------------------------------
# Busqueda: solo en el modulo de contexto, con citas y confianza
# ----------------------------------------------------------------------
@router.post("/search")
async def search(body: SearchRequest, request: Request,
                 user: dict = Depends(validator.get_current_user())) -> dict:
    await _check_access(request, user, body.module)
    components = request.app.state.components
    if components.search is None:
        raise HTTPException(status_code=503, detail="busqueda_no_disponible")
    result = await components.search.run(body.question, [body.module],
                                         str(user.get("user_id", "")), body.module)
    # Los extractos de sesiones grabadas salen sin nombres de participantes
    participants = getattr(components, "participants", None)
    textos = [mask_participants(h.text, await participants.names(h.relative_path) if participants else [])
              if h.kind == BlockKind.SPEECH else h.text for h in result.hits]
    return {
        "confidence": str(result.confidence),
        "overlap": result.overlap,
        "results": [{
            "title": h.document_title, "document": h.relative_path, "module": h.module,
            "kind": str(h.kind), "location": h.location.label(), "page": h.location.page,
            "slide": h.location.slide, "start_seconds": h.location.start_seconds,
            "context": h.context_header, "text": textos[n], "score": h.score,
        } for n, h in enumerate(result.hits)],
    }
