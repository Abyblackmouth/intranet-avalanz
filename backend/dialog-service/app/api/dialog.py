# ----------------------------------------------------------------------
# Ruta del dialogo: POST /api/v1/dialog/message
# Requiere sesion y que el modulo este en el token. Cuenta cada mensaje
# por tipo e intencion en Prometheus (dialog_messages_total).
# ----------------------------------------------------------------------
from fastapi import APIRouter, Depends, HTTPException, Request
from prometheus_client import Counter
from pydantic import BaseModel, Field

from app.config import settings
from app.domain.models import KnowledgeUnavailable
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(tags=["dialogo"])
validator = JWTValidator(secret_key=settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
MESSAGES = Counter("dialog_messages_total", "Mensajes atendidos por tipo e intencion", ["type", "intent"])


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    module: str = Field(min_length=1, max_length=100)


@router.post("/message")
async def message(body: MessageRequest, request: Request,
                  user: dict = Depends(validator.get_current_user())) -> dict:
    modules = {m.get("slug") for m in user.get("modules", []) if isinstance(m, dict)}
    if not user.get("is_super_admin") and body.module not in modules:
        raise HTTPException(status_code=403, detail="sin_acceso_al_modulo")
    try:
        result = await request.app.state.handler.run(body.message, body.module,
                                                     request.headers.get("authorization", ""))
    except KnowledgeUnavailable as error:
        raise HTTPException(status_code=error.status, detail=error.detail) from error
    MESSAGES.labels(result["type"], result.get("intent") or "-").inc()
    return result
