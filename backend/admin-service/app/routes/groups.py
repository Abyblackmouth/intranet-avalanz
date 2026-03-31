from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.config import config
from app.database import get_db
from app.services import group_service
from shared.models.responses import DataResponse, CreatedResponse, DeletedResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/groups", tags=["Grupos"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateGroupRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateGroupRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=CreatedResponse)
async def create_group(
    body: CreateGroupRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await group_service.create_group(
        db=db, name=body.name, description=body.description, requested_by=payload
    )
    return CreatedResponse(data=result)


@router.get("/", response_model=DataResponse)
async def list_groups(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await group_service.list_groups(
        db=db, page=page, per_page=per_page, is_active=is_active, requested_by=payload
    )
    return DataResponse(success=True, message="Grupos obtenidos", data=result)


@router.get("/{group_id}", response_model=DataResponse)
async def get_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await group_service.get_group_by_id(db=db, group_id=group_id)
    return DataResponse(success=True, message="Grupo obtenido", data=result)


@router.patch("/{group_id}", response_model=DataResponse)
async def update_group(
    group_id: str,
    body: UpdateGroupRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await group_service.update_group(
        db=db, group_id=group_id, name=body.name,
        description=body.description, requested_by=payload
    )
    return DataResponse(success=True, message="Grupo actualizado", data=result)


@router.patch("/{group_id}/enable", response_model=DataResponse)
async def enable_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await group_service.enable_group(db=db, group_id=group_id, requested_by=payload)
    return DataResponse(success=True, message="Grupo habilitado exitosamente", data=result)


@router.patch("/{group_id}/disable", response_model=DataResponse)
async def disable_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await group_service.disable_group(db=db, group_id=group_id, requested_by=payload)
    return DataResponse(success=True, message="Grupo deshabilitado exitosamente", data=result)


@router.delete("/{group_id}", response_model=DeletedResponse)
async def delete_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await group_service.delete_group(db=db, group_id=group_id, requested_by=payload)
    return DeletedResponse()