from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, Dict, Any

from app.config import config
from app.models.admin_models import (
    GlobalPermission,
    SubmodulePermission,
    Submodule,
    Module,
)
from shared.utils.helpers import paginate, get_offset, slugify, now_utc
from shared.exceptions.http_exceptions import (
    NotFoundException,
    AlreadyExistsException,
    ForbiddenException,
)


# ── Permisos globales ─────────────────────────────────────────────────────────

async def create_global_permission(
    db: AsyncSession,
    name: str,
    description: Optional[str] = None,
    category: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear permisos globales")

    slug = slugify(name)

    result = await db.execute(
        select(GlobalPermission).where(
            GlobalPermission.slug == slug,
            GlobalPermission.is_deleted == False,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException(f"Permiso global con slug '{slug}'")

    permission = GlobalPermission(
        name=name,
        slug=slug,
        description=description,
        category=category,
    )
    db.add(permission)
    await db.commit()
    await db.refresh(permission)

    return _serialize_global_permission(permission)


async def list_global_permissions(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    category: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(GlobalPermission).where(GlobalPermission.is_deleted == False)

    if category:
        query = query.where(GlobalPermission.category == category)

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    permissions = result.scalars().all()

    return {
        "data": [_serialize_global_permission(p) for p in permissions],
        "meta": paginate(total, page, per_page),
    }


async def update_global_permission(
    db: AsyncSession,
    permission_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar permisos globales")

    result = await db.execute(
        select(GlobalPermission).where(
            GlobalPermission.id == permission_id,
            GlobalPermission.is_deleted == False,
        )
    )
    permission = result.scalar_one_or_none()
    if not permission:
        raise NotFoundException("Permiso global")

    values = {}
    if name is not None:
        values["name"] = name
        values["slug"] = slugify(name)
    if description is not None:
        values["description"] = description
    if category is not None:
        values["category"] = category

    if values:
        await db.execute(
            update(GlobalPermission).where(GlobalPermission.id == permission_id).values(**values)
        )
        await db.commit()

    result = await db.execute(
        select(GlobalPermission).where(GlobalPermission.id == permission_id)
    )
    return _serialize_global_permission(result.scalar_one())


async def delete_global_permission(
    db: AsyncSession,
    permission_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar permisos globales")

    result = await db.execute(
        select(GlobalPermission).where(
            GlobalPermission.id == permission_id,
            GlobalPermission.is_deleted == False,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Permiso global")

    await db.execute(
        update(GlobalPermission).where(GlobalPermission.id == permission_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
        )
    )
    await db.commit()


# ── Permisos por submodulo ────────────────────────────────────────────────────

async def create_submodule_permission(
    db: AsyncSession,
    submodule_id: str,
    name: str,
    description: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear permisos de submodulo")

    result = await db.execute(
        select(Submodule).where(
            Submodule.id == submodule_id,
            Submodule.is_deleted == False,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Submodulo")

    slug = slugify(name)

    result = await db.execute(
        select(SubmodulePermission).where(
            SubmodulePermission.submodule_id == submodule_id,
            SubmodulePermission.slug == slug,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException(f"Permiso '{slug}' en este submodulo")

    permission = SubmodulePermission(
        submodule_id=submodule_id,
        name=name,
        slug=slug,
        description=description,
    )
    db.add(permission)
    await db.commit()
    await db.refresh(permission)

    return _serialize_submodule_permission(permission)


async def list_submodule_permissions(
    db: AsyncSession,
    submodule_id: str,
    page: int = 1,
    per_page: int = 20,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(SubmodulePermission).where(
        SubmodulePermission.submodule_id == submodule_id
    )

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    permissions = result.scalars().all()

    return {
        "data": [_serialize_submodule_permission(p) for p in permissions],
        "meta": paginate(total, page, per_page),
    }


async def update_submodule_permission(
    db: AsyncSession,
    permission_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar permisos de submodulo")

    result = await db.execute(
        select(SubmodulePermission).where(SubmodulePermission.id == permission_id)
    )
    permission = result.scalar_one_or_none()
    if not permission:
        raise NotFoundException("Permiso de submodulo")

    values = {}
    if name is not None:
        values["name"] = name
        values["slug"] = slugify(name)
    if description is not None:
        values["description"] = description

    if values:
        await db.execute(
            update(SubmodulePermission).where(SubmodulePermission.id == permission_id).values(**values)
        )
        await db.commit()

    result = await db.execute(
        select(SubmodulePermission).where(SubmodulePermission.id == permission_id)
    )
    return _serialize_submodule_permission(result.scalar_one())


async def delete_submodule_permission(
    db: AsyncSession,
    permission_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar permisos de submodulo")

    result = await db.execute(
        select(SubmodulePermission).where(SubmodulePermission.id == permission_id)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Permiso de submodulo")

    await db.execute(
        update(SubmodulePermission).where(SubmodulePermission.id == permission_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
        )
    )
    await db.commit()


# ── Permisos completos de un modulo (vista para el admin) ─────────────────────

async def get_module_permissions_tree(
    db: AsyncSession,
    module_id: str,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    result = await db.execute(
        select(Module).where(Module.id == module_id, Module.is_deleted == False)
    )
    module = result.scalar_one_or_none()
    if not module:
        raise NotFoundException("Modulo")

    submodules_result = await db.execute(
        select(Submodule).where(
            Submodule.module_id == module_id,
            Submodule.is_deleted == False,
        ).order_by(Submodule.order.asc())
    )
    submodules = submodules_result.scalars().all()

    tree = []
    for submodule in submodules:
        perms_result = await db.execute(
            select(SubmodulePermission).where(
                SubmodulePermission.submodule_id == submodule.id,
                SubmodulePermission.is_deleted == False,
            )
        )
        permissions = perms_result.scalars().all()
        tree.append({
            "submodule_id": str(submodule.id),
            "submodule_name": submodule.name,
            "submodule_slug": submodule.slug,
            "permissions": [_serialize_submodule_permission(p) for p in permissions],
        })

    return {
        "module_id": str(module.id),
        "module_name": module.name,
        "module_slug": module.slug,
        "submodules": tree,
    }


# ── Helpers internos ──────────────────────────────────────────────────────────

def _serialize_global_permission(permission: GlobalPermission) -> Dict[str, Any]:
    return {
        "permission_id": str(permission.id),
        "name": permission.name,
        "slug": permission.slug,
        "description": permission.description,
        "category": permission.category,
        "created_at": permission.created_at.isoformat(),
    }


def _serialize_submodule_permission(permission: SubmodulePermission) -> Dict[str, Any]:
    return {
        "permission_id": str(permission.id),
        "submodule_id": str(permission.submodule_id),
        "name": permission.name,
        "slug": permission.slug,
        "description": permission.description,
    }


def _is_global_admin(payload: Optional[Dict[str, Any]]) -> bool:
    if not payload:
        return False
    return "super_admin" in payload.get("roles", [])