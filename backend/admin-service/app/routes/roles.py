from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.config import config
from app.database import get_db
from app.services import role_service
from shared.models.responses import DataResponse, CreatedResponse, DeletedResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/roles", tags=["Roles"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas de entrada ────────────────────────────────────────────────────────

class CreateGlobalRoleRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateGlobalRoleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CreateModuleRoleRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateModuleRoleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class AssignPermissionRequest(BaseModel):
    permission_id: str


# ── Roles globales ────────────────────────────────────────────────────────────

@router.post("/global", response_model=CreatedResponse)
async def create_global_role(
    body: CreateGlobalRoleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await role_service.create_global_role(
        db=db,
        name=body.name,
        description=body.description,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.get("/global", response_model=DataResponse)
async def list_global_roles(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await role_service.list_global_roles(
        db=db, page=page, per_page=per_page, requested_by=payload
    )
    return DataResponse(success=True, message="Roles globales obtenidos", data=result)


@router.patch("/global/{role_id}", response_model=DataResponse)
async def update_global_role(
    role_id: str,
    body: UpdateGlobalRoleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await role_service.update_global_role(
        db=db,
        role_id=role_id,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Rol global actualizado", data=result)


@router.delete("/global/{role_id}", response_model=DeletedResponse)
async def delete_global_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await role_service.delete_global_role(db=db, role_id=role_id, requested_by=payload)
    return DeletedResponse()


@router.post("/global/{role_id}/permissions", response_model=BaseResponse)
async def assign_permission_to_global_role(
    role_id: str,
    body: AssignPermissionRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await role_service.assign_permission_to_global_role(
        db=db,
        role_id=role_id,
        permission_id=body.permission_id,
        requested_by=payload,
    )
    return BaseResponse(success=True, message="Permiso asignado al rol global exitosamente")


# ── Roles por modulo ──────────────────────────────────────────────────────────

@router.post("/modules/{module_id}", response_model=CreatedResponse)
async def create_module_role(
    module_id: str,
    body: CreateModuleRoleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await role_service.create_module_role(
        db=db,
        module_id=module_id,
        name=body.name,
        description=body.description,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.get("/modules/{module_id}", response_model=DataResponse)
async def list_module_roles(
    module_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await role_service.list_module_roles(
        db=db, module_id=module_id, page=page, per_page=per_page, requested_by=payload
    )
    return DataResponse(success=True, message="Roles del modulo obtenidos", data=result)


@router.patch("/modules/{module_id}/{role_id}", response_model=DataResponse)
async def update_module_role(
    module_id: str,
    role_id: str,
    body: UpdateModuleRoleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await role_service.update_module_role(
        db=db,
        role_id=role_id,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Rol de modulo actualizado", data=result)


@router.delete("/modules/{module_id}/{role_id}", response_model=DeletedResponse)
async def delete_module_role(
    module_id: str,
    role_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await role_service.delete_module_role(db=db, role_id=role_id, requested_by=payload)
    return DeletedResponse()


@router.post("/modules/{module_id}/{role_id}/permissions", response_model=BaseResponse)
async def assign_permission_to_module_role(
    module_id: str,
    role_id: str,
    body: AssignPermissionRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await role_service.assign_permission_to_module_role(
        db=db,
        role_id=role_id,
        permission_id=body.permission_id,
        requested_by=payload,
    )
    return BaseResponse(success=True, message="Permiso asignado al rol de modulo exitosamente")