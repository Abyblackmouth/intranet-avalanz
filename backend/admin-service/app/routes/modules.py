from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.config import config
from app.database import get_db
from app.services import module_service
from shared.models.responses import DataResponse, CreatedResponse, DeletedResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/modules", tags=["Modulos"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas de entrada ────────────────────────────────────────────────────────

class CreateModuleRequest(BaseModel):
    company_id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    order: int = 0


class UpdateModuleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None


class CreateSubmoduleRequest(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    order: int = 0


class UpdateSubmoduleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None


# ── Endpoints de modulos ──────────────────────────────────────────────────────

@router.post("/", response_model=CreatedResponse)
async def create_module(
    body: CreateModuleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await module_service.create_module(
        db=db,
        company_id=body.company_id,
        name=body.name,
        description=body.description,
        icon=body.icon,
        order=body.order,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.get("/", response_model=DataResponse)
async def list_modules(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    result = await module_service.list_modules(
        db=db,
        page=page,
        per_page=per_page,
        company_id=company_id,
        is_active=is_active,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Modulos obtenidos", data=result)


@router.get("/{module_id}", response_model=DataResponse)
async def get_module(
    module_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    result = await module_service.get_module_by_id(
        db=db, module_id=module_id, requested_by=payload
    )
    return DataResponse(success=True, message="Modulo obtenido", data=result)


@router.patch("/{module_id}", response_model=DataResponse)
async def update_module(
    module_id: str,
    body: UpdateModuleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await module_service.update_module(
        db=db,
        module_id=module_id,
        name=body.name,
        description=body.description,
        icon=body.icon,
        order=body.order,
        is_active=body.is_active,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Modulo actualizado", data=result)


@router.delete("/{module_id}", response_model=DeletedResponse)
async def delete_module(
    module_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await module_service.delete_module(db=db, module_id=module_id, requested_by=payload)
    return DeletedResponse()


# ── Endpoints de submodulos ───────────────────────────────────────────────────

@router.post("/{module_id}/submodules", response_model=CreatedResponse)
async def create_submodule(
    module_id: str,
    body: CreateSubmoduleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await module_service.create_submodule(
        db=db,
        module_id=module_id,
        name=body.name,
        description=body.description,
        icon=body.icon,
        order=body.order,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.patch("/{module_id}/submodules/{submodule_id}", response_model=DataResponse)
async def update_submodule(
    module_id: str,
    submodule_id: str,
    body: UpdateSubmoduleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await module_service.update_submodule(
        db=db,
        submodule_id=submodule_id,
        name=body.name,
        description=body.description,
        icon=body.icon,
        order=body.order,
        is_active=body.is_active,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Submodulo actualizado", data=result)


@router.delete("/{module_id}/submodules/{submodule_id}", response_model=DeletedResponse)
async def delete_submodule(
    module_id: str,
    submodule_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await module_service.delete_submodule(
        db=db, submodule_id=submodule_id, requested_by=payload
    )
    return DeletedResponse()