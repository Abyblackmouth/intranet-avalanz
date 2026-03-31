from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, Dict, Any, List

from app.config import config
from app.models.admin_models import Module, Submodule, Company
from shared.utils.helpers import paginate, get_offset, slugify, now_utc
from shared.exceptions.http_exceptions import (
    NotFoundException,
    AlreadyExistsException,
    ForbiddenException,
    ValidationException,
)


# ── Crear modulo ──────────────────────────────────────────────────────────────

async def create_module(
    db: AsyncSession,
    company_id: str,
    name: str,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    order: int = 0,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear modulos")

    # Verificar que la empresa existe
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Empresa")

    slug = slugify(name)

    # Verificar slug unico
    result = await db.execute(
        select(Module).where(Module.slug == slug, Module.is_deleted == False)
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException(f"Modulo con slug '{slug}'")

    module = Module(
        company_id=company_id,
        name=name,
        slug=slug,
        description=description,
        icon=icon,
        order=order,
        is_active=True,
    )
    db.add(module)
    await db.commit()
    await db.refresh(module)

    return _serialize_module(module)


# ── Obtener modulo ────────────────────────────────────────────────────────────

async def get_module_by_id(
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

    _check_module_scope(requested_by, module)

    # Cargar submodulos
    sub_result = await db.execute(
        select(Submodule).where(
            Submodule.module_id == module_id,
            Submodule.is_deleted == False,
        ).order_by(Submodule.order.asc())
    )
    submodules = sub_result.scalars().all()

    data = _serialize_module(module)
    data["submodules"] = [_serialize_submodule(s) for s in submodules]
    return data


# ── Listar modulos ────────────────────────────────────────────────────────────

async def list_modules(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    company_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(Module).where(Module.is_deleted == False)

    if not _is_global_admin(requested_by):
        # Admin de empresa solo ve modulos de su empresa
        query = query.where(Module.company_id == requested_by.get("company_id"))
    elif company_id:
        query = query.where(Module.company_id == company_id)

    if is_active is not None:
        query = query.where(Module.is_active == is_active)

    query = query.order_by(Module.order.asc())

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    modules = result.scalars().all()

    return {
        "data": [_serialize_module(m) for m in modules],
        "meta": paginate(total, page, per_page),
    }


# ── Actualizar modulo ─────────────────────────────────────────────────────────

async def update_module(
    db: AsyncSession,
    module_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    order: Optional[int] = None,
    is_active: Optional[bool] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar modulos")

    result = await db.execute(
        select(Module).where(Module.id == module_id, Module.is_deleted == False)
    )
    module = result.scalar_one_or_none()
    if not module:
        raise NotFoundException("Modulo")

    values = {}
    if name is not None:
        new_slug = slugify(name)
        existing = await db.execute(
            select(Module).where(
                Module.slug == new_slug,
                Module.id != module_id,
                Module.is_deleted == False,
            )
        )
        if existing.scalar_one_or_none():
            raise AlreadyExistsException(f"Modulo con slug '{new_slug}'")
        values["name"] = name
        values["slug"] = new_slug
    if description is not None:
        values["description"] = description
    if icon is not None:
        values["icon"] = icon
    if order is not None:
        values["order"] = order
    if is_active is not None:
        values["is_active"] = is_active

    if values:
        await db.execute(update(Module).where(Module.id == module_id).values(**values))
        await db.commit()

    return await get_module_by_id(db, module_id, requested_by)


# ── Eliminar modulo (soft delete) ─────────────────────────────────────────────

async def delete_module(
    db: AsyncSession,
    module_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar modulos")

    result = await db.execute(
        select(Module).where(Module.id == module_id, Module.is_deleted == False)
    )
    module = result.scalar_one_or_none()
    if not module:
        raise NotFoundException("Modulo")

    await db.execute(
        update(Module).where(Module.id == module_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
            is_active=False,
        )
    )
    await db.commit()


# ── Crear submodulo ───────────────────────────────────────────────────────────

async def create_submodule(
    db: AsyncSession,
    module_id: str,
    name: str,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    order: int = 0,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear submodulos")

    result = await db.execute(
        select(Module).where(Module.id == module_id, Module.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Modulo")

    slug = slugify(name)

    result = await db.execute(
        select(Submodule).where(
            Submodule.module_id == module_id,
            Submodule.slug == slug,
            Submodule.is_deleted == False,
        )
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException(f"Submodulo con slug '{slug}' en este modulo")

    submodule = Submodule(
        module_id=module_id,
        name=name,
        slug=slug,
        description=description,
        icon=icon,
        order=order,
        is_active=True,
    )
    db.add(submodule)
    await db.commit()
    await db.refresh(submodule)

    return _serialize_submodule(submodule)


# ── Actualizar submodulo ──────────────────────────────────────────────────────

async def update_submodule(
    db: AsyncSession,
    submodule_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    order: Optional[int] = None,
    is_active: Optional[bool] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar submodulos")

    result = await db.execute(
        select(Submodule).where(Submodule.id == submodule_id, Submodule.is_deleted == False)
    )
    submodule = result.scalar_one_or_none()
    if not submodule:
        raise NotFoundException("Submodulo")

    values = {}
    if name is not None:
        values["name"] = name
        values["slug"] = slugify(name)
    if description is not None:
        values["description"] = description
    if icon is not None:
        values["icon"] = icon
    if order is not None:
        values["order"] = order
    if is_active is not None:
        values["is_active"] = is_active

    if values:
        await db.execute(update(Submodule).where(Submodule.id == submodule_id).values(**values))
        await db.commit()
        await db.execute(select(Submodule).where(Submodule.id == submodule_id))

    result = await db.execute(
        select(Submodule).where(Submodule.id == submodule_id)
    )
    return _serialize_submodule(result.scalar_one())


# ── Eliminar submodulo (soft delete) ──────────────────────────────────────────

async def delete_submodule(
    db: AsyncSession,
    submodule_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar submodulos")

    result = await db.execute(
        select(Submodule).where(Submodule.id == submodule_id, Submodule.is_deleted == False)
    )
    submodule = result.scalar_one_or_none()
    if not submodule:
        raise NotFoundException("Submodulo")

    await db.execute(
        update(Submodule).where(Submodule.id == submodule_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
            is_active=False,
        )
    )
    await db.commit()


# ── Helpers internos ──────────────────────────────────────────────────────────

def _serialize_module(module: Module) -> Dict[str, Any]:
    return {
        "module_id": str(module.id),
        "company_id": str(module.company_id),
        "name": module.name,
        "slug": module.slug,
        "description": module.description,
        "icon": module.icon,
        "order": module.order,
        "is_active": module.is_active,
        "created_at": module.created_at.isoformat(),
    }


def _serialize_submodule(submodule: Submodule) -> Dict[str, Any]:
    return {
        "submodule_id": str(submodule.id),
        "module_id": str(submodule.module_id),
        "name": submodule.name,
        "slug": submodule.slug,
        "description": submodule.description,
        "icon": submodule.icon,
        "order": submodule.order,
        "is_active": submodule.is_active,
        "created_at": submodule.created_at.isoformat(),
    }


def _is_global_admin(payload: Optional[Dict[str, Any]]) -> bool:
    if not payload:
        return False
    return "super_admin" in payload.get("roles", [])


def _check_module_scope(payload: Optional[Dict[str, Any]], module: Module) -> None:
    if not payload:
        raise ForbiddenException("Sin permisos")
    if _is_global_admin(payload):
        return
    if payload.get("company_id") != str(module.company_id):
        modules_access = payload.get("modules", [])
        if module.slug not in modules_access:
            raise ForbiddenException("No tienes acceso a este modulo")