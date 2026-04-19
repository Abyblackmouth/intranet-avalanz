from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import Optional, List

from app.config import config
from app.database import get_db
from app.services import user_service
from shared.models.responses import DataResponse, CreatedResponse, DeletedResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/users", tags=["Usuarios"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


class CreateUserRequest(BaseModel):
    company_id: str
    email: EmailStr
    full_name: str
    matricula: Optional[str] = None
    puesto: Optional[str] = None
    departamento: Optional[str] = None
    is_super_admin: bool = False
    global_role_id: Optional[str] = None
    module_accesses: Optional[List[dict]] = None


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
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


class ToggleLockRequest(BaseModel):
    lock: bool
    reason: str


class RemoveGlobalRoleRequest(BaseModel):
    role_id: str


class ResetPasswordRequest(BaseModel):
    new_password: str


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
    if body.global_role_id:
        await user_service.assign_global_role(
            db=db,
            user_id=result["user_id"],
            role_id=body.global_role_id,
            requested_by=payload,
        )
    if body.module_accesses:
        for access in body.module_accesses:
            try:
                await user_service.assign_module_access(
                    db=db,
                    user_id=result["user_id"],
                    module_id=access["module_id"],
                    role_id=access["role_id"],
                    requested_by=payload,
                )
            except Exception:
                pass
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
        email=body.email,
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


@router.delete("/{user_id}/global-roles", response_model=BaseResponse)
async def remove_global_role(
    user_id: str,
    body: RemoveGlobalRoleRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await user_service.remove_global_role(
        db=db,
        user_id=user_id,
        role_id=body.role_id,
        requested_by=payload,
    )
    return BaseResponse(success=True, message="Rol removido exitosamente")


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


@router.get("/{user_id}/sessions", response_model=DataResponse)
async def get_user_sessions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    import httpx
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"http://auth-service:8000/api/v1/auth/internal/users/{user_id}/sessions")
    return DataResponse(success=True, message="Sesiones obtenidas", data=resp.json())


@router.get("/{user_id}/login-history", response_model=DataResponse)
async def get_user_login_history(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    import httpx
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"http://auth-service:8000/api/v1/auth/internal/users/{user_id}/login-history")
    return DataResponse(success=True, message="Historial obtenido", data=resp.json())


@router.post("/{user_id}/lock", response_model=DataResponse)
async def toggle_lock_user(
    user_id: str,
    body: ToggleLockRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await user_service.toggle_lock_user(
        db=db,
        user_id=user_id,
        lock=body.lock,
        reason=body.reason,
        requested_by=payload,
    )
    action = "bloqueado" if body.lock else "desbloqueado"
    return DataResponse(success=True, message=f"Usuario {action} exitosamente", data=result)


@router.post("/{user_id}/reset-password", response_model=BaseResponse)
async def reset_user_password(
    user_id: str,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    await user_service.reset_password(
        db=db,
        user_id=user_id,
        new_password=body.new_password,
        requested_by=payload,
    )
    return BaseResponse(success=True, message="Contrasena reseteada exitosamente")