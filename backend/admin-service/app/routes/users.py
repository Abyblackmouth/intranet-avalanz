from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.config import config
from app.database import get_db
from app.services import user_service
from shared.models.responses import DataResponse, CreatedResponse, DeletedResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/users", tags=["Usuarios"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas de entrada ────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    company_id: str
    email: EmailStr
    full_name: str
    matricula: Optional[str] = None
    puesto: Optional[str] = None
    departamento: Optional[str] = None
    is_super_admin: bool = False


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    matricula: Optional[str] = None
    puesto: Optional[str] = None
    departamento: Optional[str] = None
    is_active: Optional[bool] = None


class AssignGlobalRoleRequest(BaseModel):
    role_id: str


class AssignModuleAccessRequest(BaseModel):
    module_id: str
    role_id: str


class RevokeModuleAccessRequest(BaseModel):
    module_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=CreatedResponse)
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await user_service.create_user(
        db=db,
        company_id=body.company_id,
        email=body.email,
        full_name=body.full_name,
        matricula=body.matricula,
        puesto=body.puesto,
        departamento=body.departamento,
        is_super_admin=body.is_super_admin,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.get("/", response_model=DataResponse)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    company_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await user_service.list_users(
        db=db,
        page=page,
        per_page=per_page,
        company_id=company_id,
        is_active=is_active,
        search=search,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Usuarios obtenidos", data=result)


@router.get("/{user_id}", response_model=DataResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await user_service.get_user_by_id(db=db, user_id=user_id)
    return DataResponse(success=True, message="Usuario obtenido", data=result)


@router.patch("/{user_id}", response_model=DataResponse)
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await user_service.update_user(
        db=db,
        user_id=user_id,
        full_name=body.full_name,
        matricula=body.matricula,
        puesto=body.puesto,
        departamento=body.departamento,
        is_active=body.is_active,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Usuario actualizado", data=result)


@router.delete("/{user_id}", response_model=DeletedResponse)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    await user_service.delete_user(db=db, user_id=user_id, requested_by=payload)
    return DeletedResponse()


@router.post("/{user_id}/global-roles", response_model=BaseResponse)
async def assign_global_role(
    user_id: str,
    body: AssignGlobalRoleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await user_service.assign_global_role(
        db=db,
        user_id=user_id,
        role_id=body.role_id,
        requested_by=payload,
    )
    return BaseResponse(success=True, message="Rol global asignado exitosamente")


@router.post("/{user_id}/module-access", response_model=BaseResponse)
async def assign_module_access(
    user_id: str,
    body: AssignModuleAccessRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    await user_service.assign_module_access(
        db=db,
        user_id=user_id,
        module_id=body.module_id,
        role_id=body.role_id,
        requested_by=payload,
    )
    return BaseResponse(success=True, message="Acceso al modulo asignado exitosamente")


@router.delete("/{user_id}/module-access", response_model=BaseResponse)
async def revoke_module_access(
    user_id: str,
    body: RevokeModuleAccessRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    await user_service.revoke_module_access(
        db=db,
        user_id=user_id,
        module_id=body.module_id,
        requested_by=payload,
    )
    return BaseResponse(success=True, message="Acceso al modulo revocado exitosamente")


@router.get("/{user_id}/permissions", response_model=DataResponse)
async def get_user_permissions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await user_service.get_user_permissions(db=db, user_id=user_id)
    return DataResponse(success=True, message="Permisos del usuario obtenidos", data=result)