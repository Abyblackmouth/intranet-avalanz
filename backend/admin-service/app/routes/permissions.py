from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.config import config
from app.database import get_db
from app.services import permission_service
from shared.models.responses import DataResponse, CreatedResponse, DeletedResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/permissions", tags=["Permisos"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas de entrada ────────────────────────────────────────────────────────

class CreateGlobalPermissionRequest(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None


class UpdateGlobalPermissionRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


class CreateSubmodulePermissionRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateSubmodulePermissionRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ── Permisos globales ─────────────────────────────────────────────────────────

@router.post("/global", response_model=CreatedResponse)
async def create_global_permission(
    body: CreateGlobalPermissionRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await permission_service.create_global_permission(
        db=db,
        name=body.name,
        description=body.description,
        category=body.category,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.get("/global", response_model=DataResponse)
async def list_global_permissions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await permission_service.list_global_permissions(
        db=db, page=page, per_page=per_page, category=category, requested_by=payload
    )
    return DataResponse(success=True, message="Permisos globales obtenidos", data=result)


@router.patch("/global/{permission_id}", response_model=DataResponse)
async def update_global_permission(
    permission_id: str,
    body: UpdateGlobalPermissionRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await permission_service.update_global_permission(
        db=db,
        permission_id=permission_id,
        name=body.name,
        description=body.description,
        category=body.category,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Permiso global actualizado", data=result)


@router.delete("/global/{permission_id}", response_model=DeletedResponse)
async def delete_global_permission(
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await permission_service.delete_global_permission(
        db=db, permission_id=permission_id, requested_by=payload
    )
    return DeletedResponse()


# ── Permisos por submodulo ────────────────────────────────────────────────────

@router.post("/submodules/{submodule_id}", response_model=CreatedResponse)
async def create_submodule_permission(
    submodule_id: str,
    body: CreateSubmodulePermissionRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await permission_service.create_submodule_permission(
        db=db,
        submodule_id=submodule_id,
        name=body.name,
        description=body.description,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.get("/submodules/{submodule_id}", response_model=DataResponse)
async def list_submodule_permissions(
    submodule_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await permission_service.list_submodule_permissions(
        db=db, submodule_id=submodule_id, page=page, per_page=per_page, requested_by=payload
    )
    return DataResponse(success=True, message="Permisos del submodulo obtenidos", data=result)


@router.patch("/submodules/{submodule_id}/{permission_id}", response_model=DataResponse)
async def update_submodule_permission(
    submodule_id: str,
    permission_id: str,
    body: UpdateSubmodulePermissionRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await permission_service.update_submodule_permission(
        db=db,
        permission_id=permission_id,
        name=body.name,
        description=body.description,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Permiso de submodulo actualizado", data=result)


@router.delete("/submodules/{submodule_id}/{permission_id}", response_model=DeletedResponse)
async def delete_submodule_permission(
    submodule_id: str,
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await permission_service.delete_submodule_permission(
        db=db, permission_id=permission_id, requested_by=payload
    )
    return DeletedResponse()


# ── Arbol de permisos de un modulo ────────────────────────────────────────────

@router.get("/modules/{module_id}/tree", response_model=DataResponse)
async def get_module_permissions_tree(
    module_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await permission_service.get_module_permissions_tree(
        db=db, module_id=module_id, requested_by=payload
    )
    return DataResponse(
        success=True,
        message="Arbol de permisos del modulo obtenido",
        data=result,
    )