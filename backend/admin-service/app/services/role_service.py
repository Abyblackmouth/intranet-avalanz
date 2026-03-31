from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, Dict, Any

from app.config import config
from app.models.admin_models import (
    GlobalRole, ModuleRole, Module,
    GlobalRolePermission, ModuleRolePermission,
    GlobalPermission, SubmodulePermission,
)
from shared.utils.helpers import paginate, get_offset, slugify, now_utc
from shared.exceptions.http_exceptions import (
    NotFoundException,
    AlreadyExistsException,
    ForbiddenException,
)


# ── Roles globales ────────────────────────────────────────────────────────────

async def create_global_role(
    db: AsyncSession,
    name: str,
    description: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear roles globales")

    slug = slugify(name)

    result = await db.execute(
        select(GlobalRole).where(GlobalRole.slug == slug, GlobalRole.is_deleted == False)
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException(f"Rol global con slug '{slug}'")

    role = GlobalRole(name=name, slug=slug, description=description, is_active=True)
    db.add(role)
    await db.commit()
    await db.refresh(role)

    return _serialize_global_role(role)


async def list_global_roles(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(GlobalRole).where(GlobalRole.is_deleted == False)

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    roles = result.scalars().all()

    return {
        "data": [_serialize_global_role(r) for r in roles],
        "meta": paginate(total, page, per_page),
    }


async def update_global_role(
    db: AsyncSession,
    role_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    is_active: Optional[bool] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar roles globales")

    result = await db.execute(
        select(GlobalRole).where(GlobalRole.id == role_id, GlobalRole.is_deleted == False)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundException("Rol global")

    values = {}
    if name is not None:
        values["name"] = name
        values["slug"] = slugify(name)
    if description is not None:
        values["description"] = description
    if is_active is not None:
        values["is_active"] = is_active

    if values:
        await db.execute(update(GlobalRole).where(GlobalRole.id == role_id).values(**values))
        await db.commit()

    result = await db.execute(select(GlobalRole).where(GlobalRole.id == role_id))
    return _serialize_global_role(result.scalar_one())


async def delete_global_role(
    db: AsyncSession,
    role_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar roles globales")

    result = await db.execute(
        select(GlobalRole).where(GlobalRole.id == role_id, GlobalRole.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol global")

    await db.execute(
        update(GlobalRole).where(GlobalRole.id == role_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
            is_active=False,
        )
    )
    await db.commit()


# ── Roles por modulo ──────────────────────────────────────────────────────────

async def create_module_role(
    db: AsyncSession,
    module_id: str,
    name: str,
    description: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear roles de modulo")

    result = await db.execute(
        select(Module).where(Module.id == module_id, Module.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Modulo")

    slug = slugify(name)

    result = await db.execute(
        select(ModuleRole).where(
            ModuleRole.module_id == module_id,
            ModuleRole.slug == slug,
            ModuleRole.is_deleted == False,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException(f"Rol '{slug}' en este modulo")

    role = ModuleRole(
        module_id=module_id,
        name=name,
        slug=slug,
        description=description,
        is_active=True,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)

    return _serialize_module_role(role)


async def list_module_roles(
    db: AsyncSession,
    module_id: str,
    page: int = 1,
    per_page: int = 20,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(ModuleRole).where(
        ModuleRole.module_id == module_id,
        ModuleRole.is_deleted == False,
    )

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    roles = result.scalars().all()

    return {
        "data": [_serialize_module_role(r) for r in roles],
        "meta": paginate(total, page, per_page),
    }


async def update_module_role(
    db: AsyncSession,
    role_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    is_active: Optional[bool] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar roles de modulo")

    result = await db.execute(
        select(ModuleRole).where(ModuleRole.id == role_id, ModuleRole.is_deleted == False)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundException("Rol de modulo")

    values = {}
    if name is not None:
        values["name"] = name
        values["slug"] = slugify(name)
    if description is not None:
        values["description"] = description
    if is_active is not None:
        values["is_active"] = is_active

    if values:
        await db.execute(update(ModuleRole).where(ModuleRole.id == role_id).values(**values))
        await db.commit()

    result = await db.execute(select(ModuleRole).where(ModuleRole.id == role_id))
    return _serialize_module_role(result.scalar_one())


async def delete_module_role(
    db: AsyncSession,
    role_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar roles de modulo")

    result = await db.execute(
        select(ModuleRole).where(ModuleRole.id == role_id, ModuleRole.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol de modulo")

    await db.execute(
        update(ModuleRole).where(ModuleRole.id == role_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
            is_active=False,
        )
    )
    await db.commit()


# ── Asignacion de permisos a roles globales ───────────────────────────────────

async def assign_permission_to_global_role(
    db: AsyncSession,
    role_id: str,
    permission_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede asignar permisos")

    result = await db.execute(
        select(GlobalRole).where(GlobalRole.id == role_id, GlobalRole.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol global")

    result = await db.execute(
        select(GlobalPermission).where(GlobalPermission.id == permission_id, GlobalPermission.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Permiso global")

    result = await db.execute(
        select(GlobalRolePermission).where(
            GlobalRolePermission.role_id == role_id,
            GlobalRolePermission.permission_id == permission_id,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Permiso ya asignado a este rol")

    db.add(GlobalRolePermission(role_id=role_id, permission_id=permission_id))
    await db.commit()


# ── Asignacion de permisos a roles de modulo ──────────────────────────────────

async def assign_permission_to_module_role(
    db: AsyncSession,
    role_id: str,
    permission_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede asignar permisos")

    result = await db.execute(
        select(ModuleRole).where(ModuleRole.id == role_id, ModuleRole.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol de modulo")

    result = await db.execute(
        select(SubmodulePermission).where(SubmodulePermission.id == permission_id)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Permiso de submodulo")

    result = await db.execute(
        select(ModuleRolePermission).where(
            ModuleRolePermission.role_id == role_id,
            ModuleRolePermission.permission_id == permission_id,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Permiso ya asignado a este rol de modulo")

    db.add(ModuleRolePermission(role_id=role_id, permission_id=permission_id))
    await db.commit()


# ── Helpers internos ──────────────────────────────────────────────────────────

def _serialize_global_role(role: GlobalRole) -> Dict[str, Any]:
    return {
        "role_id": str(role.id),
        "name": role.name,
        "slug": role.slug,
        "description": role.description,
        "is_active": role.is_active,
        "created_at": role.created_at.isoformat(),
    }


def _serialize_module_role(role: ModuleRole) -> Dict[str, Any]:
    return {
        "role_id": str(role.id),
        "module_id": str(role.module_id),
        "name": role.name,
        "slug": role.slug,
        "description": role.description,
        "is_active": role.is_active,
        "created_at": role.created_at.isoformat(),
    }


def _is_global_admin(payload: Optional[Dict[str, Any]]) -> bool:
    if not payload:
        return False
    return "super_admin" in payload.get("roles", [])