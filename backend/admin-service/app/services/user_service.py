import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, List, Dict, Any
from datetime import timedelta

from app.config import config
from app.models.admin_models import User, UserGlobalRole, UserModuleAccess, GlobalRole, Module, ModuleRole
from shared.utils.encryption import hash_password, generate_secure_token
from shared.utils.helpers import now_utc, paginate, get_offset, is_strong_password, slugify
from shared.exceptions.http_exceptions import (
    NotFoundException,
    AlreadyExistsException,
    ValidationException,
    ForbiddenException,
)


# ── Crear usuario ─────────────────────────────────────────────────────────────

async def create_user(
    db: AsyncSession,
    company_id: str,
    email: str,
    full_name: str,
    is_super_admin: bool = False,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    # Verificar permisos del solicitante
    if is_super_admin and not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear otros super admins")

    # Verificar si el email ya existe
    result = await db.execute(
        select(User).where(User.email == email, User.is_deleted == False)
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Email")

    # Generar contrasena temporal
    temp_password = generate_secure_token(config.TEMP_PASSWORD_LENGTH)
    expires_at = now_utc() + timedelta(hours=config.TEMP_PASSWORD_EXPIRE_HOURS)

    user = User(
        company_id=company_id,
        email=email,
        full_name=full_name,
        is_active=True,
        is_super_admin=is_super_admin,
    )
    db.add(user)
    await db.flush()

    # Notificar al auth-service para crear las credenciales
    await _sync_user_to_auth(
        user_id=str(user.id),
        email=email,
        full_name=full_name,
        temp_password=temp_password,
        temp_password_expires_at=expires_at.isoformat(),
    )

    await db.commit()

    return {
        "user_id": str(user.id),
        "email": email,
        "full_name": full_name,
        "temp_password": temp_password,
        "temp_password_expires_at": expires_at.isoformat(),
        "message": "Usuario creado. La contrasena temporal tiene validez de 24 horas",
    }


# ── Obtener usuario ───────────────────────────────────────────────────────────

async def get_user_by_id(db: AsyncSession, user_id: str) -> Dict[str, Any]:
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    return _serialize_user(user)


# ── Listar usuarios ───────────────────────────────────────────────────────────

async def list_users(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    company_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(User).where(User.is_deleted == False)

    # Si no es super admin solo ve usuarios de su empresa
    if not _is_global_admin(requested_by):
        query = query.where(User.company_id == requested_by.get("company_id"))
    elif company_id:
        query = query.where(User.company_id == company_id)

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    if search:
        query = query.where(
            User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "data": [_serialize_user(u) for u in users],
        "meta": paginate(total, page, per_page),
    }


# ── Actualizar usuario ────────────────────────────────────────────────────────

async def update_user(
    db: AsyncSession,
    user_id: str,
    full_name: Optional[str] = None,
    is_active: Optional[bool] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

    _check_company_scope(requested_by, str(user.company_id))

    values = {}
    if full_name is not None:
        values["full_name"] = full_name
    if is_active is not None:
        values["is_active"] = is_active

    if values:
        await db.execute(update(User).where(User.id == user.id).values(**values))
        await db.commit()

    return await get_user_by_id(db, user_id)


# ── Eliminar usuario (soft delete) ────────────────────────────────────────────

async def delete_user(
    db: AsyncSession,
    user_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

    _check_company_scope(requested_by, str(user.company_id))

    await db.execute(
        update(User).where(User.id == user.id).values(
            is_deleted=True,
            deleted_at=now_utc(),
            is_active=False,
        )
    )
    await db.commit()


# ── Asignar rol global ────────────────────────────────────────────────────────

async def assign_global_role(
    db: AsyncSession,
    user_id: str,
    role_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede asignar roles globales")

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Usuario")

    result = await db.execute(
        select(GlobalRole).where(GlobalRole.id == role_id, GlobalRole.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol global")

    result = await db.execute(
        select(UserGlobalRole).where(
            UserGlobalRole.user_id == user_id,
            UserGlobalRole.role_id == role_id,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Asignacion de rol global")

    db.add(UserGlobalRole(user_id=user_id, role_id=role_id))
    await db.commit()


# ── Asignar acceso a modulo ───────────────────────────────────────────────────

async def assign_module_access(
    db: AsyncSession,
    user_id: str,
    module_id: str,
    role_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

    if not _is_global_admin(requested_by):
        _check_company_scope(requested_by, str(user.company_id))

    result = await db.execute(
        select(Module).where(Module.id == module_id, Module.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Modulo")

    result = await db.execute(
        select(ModuleRole).where(
            ModuleRole.id == role_id,
            ModuleRole.module_id == module_id,
            ModuleRole.is_deleted == False,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol de modulo")

    result = await db.execute(
        select(UserModuleAccess).where(
            UserModuleAccess.user_id == user_id,
            UserModuleAccess.module_id == module_id,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Acceso al modulo")

    db.add(UserModuleAccess(user_id=user_id, module_id=module_id, role_id=role_id))
    await db.commit()


# ── Revocar acceso a modulo ───────────────────────────────────────────────────

async def revoke_module_access(
    db: AsyncSession,
    user_id: str,
    module_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    result = await db.execute(
        select(UserModuleAccess).where(
            UserModuleAccess.user_id == user_id,
            UserModuleAccess.module_id == module_id,
        )
    )
    access = result.scalar_one_or_none()
    if not access:
        raise NotFoundException("Acceso al modulo")

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not _is_global_admin(requested_by):
        _check_company_scope(requested_by, str(user.company_id))

    await db.execute(
        update(UserModuleAccess).where(
            UserModuleAccess.user_id == user_id,
            UserModuleAccess.module_id == module_id,
        ).values(is_active=False)
    )
    await db.commit()


# ── Permisos del usuario (consumido por auth-service) ────────────────────────

async def get_user_permissions(db: AsyncSession, user_id: str) -> Dict[str, Any]:
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

    # Roles globales
    global_roles_result = await db.execute(
        select(GlobalRole).join(UserGlobalRole).where(
            UserGlobalRole.user_id == user_id,
            GlobalRole.is_active == True,
            GlobalRole.is_deleted == False,
        )
    )
    global_roles = [r.slug for r in global_roles_result.scalars().all()]

    if user.is_super_admin and "super_admin" not in global_roles:
        global_roles.append("super_admin")

    # Modulos y roles por modulo
    accesses_result = await db.execute(
        select(UserModuleAccess, Module, ModuleRole)
        .join(Module, UserModuleAccess.module_id == Module.id)
        .join(ModuleRole, UserModuleAccess.role_id == ModuleRole.id)
        .where(
            UserModuleAccess.user_id == user_id,
            UserModuleAccess.is_active == True,
            Module.is_active == True,
            Module.is_deleted == False,
        )
    )
    accesses = accesses_result.all()

    modules = [a.Module.slug for a in accesses]
    module_roles = [f"{a.Module.slug}:{a.ModuleRole.slug}" for a in accesses]
    companies = list(set([str(a.Module.company_id) for a in accesses]))

    return {
        "roles": global_roles + module_roles,
        "modules": modules,
        "companies": companies,
        "permissions": [],
    }


# ── Helpers internos ──────────────────────────────────────────────────────────

def _serialize_user(user: User) -> Dict[str, Any]:
    return {
        "user_id": str(user.id),
        "company_id": str(user.company_id),
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_super_admin": user.is_super_admin,
        "created_at": user.created_at.isoformat(),
    }


def _is_global_admin(payload: Optional[Dict[str, Any]]) -> bool:
    if not payload:
        return False
    roles = payload.get("roles", [])
    return "super_admin" in roles


def _check_company_scope(payload: Optional[Dict[str, Any]], target_company_id: str) -> None:
    if not payload:
        raise ForbiddenException("Sin permisos")
    if _is_global_admin(payload):
        return
    if payload.get("company_id") != target_company_id:
        raise ForbiddenException("No tienes acceso a recursos de otra empresa")


async def _sync_user_to_auth(
    user_id: str,
    email: str,
    full_name: str,
    temp_password: str,
    temp_password_expires_at: str,
) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://auth-service/internal/users",
                json={
                    "user_id": user_id,
                    "email": email,
                    "full_name": full_name,
                    "temp_password": temp_password,
                    "temp_password_expires_at": temp_password_expires_at,
                },
            )
    except Exception:
        raise ValidationException("Error al sincronizar usuario con el servicio de autenticacion")