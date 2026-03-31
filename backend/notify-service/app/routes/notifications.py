from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List

from app.config import config
from app.database import get_db
from app.services.notify_service import (
    create_notification,
    create_bulk_notifications,
    list_notifications,
    count_unread,
    mark_as_read,
    mark_all_as_read,
)
from shared.models.responses import DataResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/notifications", tags=["Notificaciones"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas de entrada ────────────────────────────────────────────────────────

class CreateNotificationRequest(BaseModel):
    user_id: str
    type: str
    title: str
    body: str
    company_id: Optional[str] = None
    module_slug: Optional[str] = None
    data: Optional[dict] = None


class CreateBulkNotificationRequest(BaseModel):
    user_ids: List[str]
    type: str
    title: str
    body: str
    company_id: Optional[str] = None
    module_slug: Optional[str] = None
    data: Optional[dict] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=DataResponse)
async def create(
    body: CreateNotificationRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    result = await create_notification(
        db=db,
        user_id=body.user_id,
        type=body.type,
        title=body.title,
        body=body.body,
        company_id=body.company_id,
        module_slug=body.module_slug,
        data=body.data,
    )
    return DataResponse(success=True, message="Notificacion creada", data=result)


@router.post("/bulk", response_model=DataResponse)
async def create_bulk(
    body: CreateBulkNotificationRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await create_bulk_notifications(
        db=db,
        user_ids=body.user_ids,
        type=body.type,
        title=body.title,
        body=body.body,
        company_id=body.company_id,
        module_slug=body.module_slug,
        data=body.data,
    )
    return DataResponse(success=True, message="Notificaciones enviadas", data=result)


@router.get("/", response_model=DataResponse)
async def list_my_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    is_read: Optional[bool] = Query(None),
    module_slug: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    result = await list_notifications(
        db=db,
        user_id=payload.get("user_id"),
        page=page,
        per_page=per_page,
        is_read=is_read,
        module_slug=module_slug,
    )
    return DataResponse(success=True, message="Notificaciones obtenidas", data=result)


@router.get("/unread-count", response_model=DataResponse)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    count = await count_unread(db=db, user_id=payload.get("user_id"))
    return DataResponse(success=True, message="Conteo de no leidas", data={"unread": count})


@router.patch("/{notification_id}/read", response_model=DataResponse)
async def read_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    result = await mark_as_read(
        db=db,
        notification_id=notification_id,
        user_id=payload.get("user_id"),
    )
    return DataResponse(success=True, message="Notificacion marcada como leida", data=result)


@router.patch("/read-all", response_model=BaseResponse)
async def read_all_notifications(
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    await mark_all_as_read(db=db, user_id=payload.get("user_id"))
    return BaseResponse(success=True, message="Todas las notificaciones marcadas como leidas")