from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, Dict, Any

from app.config import config
from app.models.admin_models import Group, Company
from shared.utils.helpers import paginate, get_offset, slugify, now_utc
from shared.exceptions.http_exceptions import (
    NotFoundException,
    AlreadyExistsException,
    ForbiddenException,
    ValidationException,
)


# ── Crear grupo ───────────────────────────────────────────────────────────────

async def create_group(
    db: AsyncSession,
    name: str,
    description: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear grupos")

    slug = slugify(name)

    existing = await db.execute(
        select(Group).where(Group.slug == slug, Group.is_deleted == False)
    )
    if existing.scalar_one_or_none():
        raise AlreadyExistsException(f"Grupo con slug '{slug}'")

    group = Group(name=name, slug=slug, description=description, is_active=True)
    db.add(group)
    await db.commit()
    await db.refresh(group)

    return _serialize_group(group)


# ── Obtener grupo ─────────────────────────────────────────────────────────────

async def get_group_by_id(db: AsyncSession, group_id: str) -> Dict[str, Any]:
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.is_deleted == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundException("Grupo")
    return _serialize_group(group)


# ── Listar grupos ─────────────────────────────────────────────────────────────

async def list_groups(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    is_active: Optional[bool] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(Group).where(Group.is_deleted == False)

    if is_active is not None:
        query = query.where(Group.is_active == is_active)

    query = query.order_by(Group.name.asc())

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    groups = result.scalars().all()

    return {
        "data": [_serialize_group(g) for g in groups],
        "meta": paginate(total, page, per_page),
    }


# ── Actualizar grupo ──────────────────────────────────────────────────────────

async def update_group(
    db: AsyncSession,
    group_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar grupos")

    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.is_deleted == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundException("Grupo")

    values = {}
    if name is not None:
        new_slug = slugify(name)
        existing = await db.execute(
            select(Group).where(
                Group.slug == new_slug,
                Group.id != group_id,
                Group.is_deleted == False,
            )
        )
        if existing.scalar_one_or_none():
            raise AlreadyExistsException(f"Grupo con slug '{new_slug}'")
        values["name"] = name
        values["slug"] = new_slug
    if description is not None:
        values["description"] = description

    if values:
        await db.execute(update(Group).where(Group.id == group_id).values(**values))
        await db.commit()

    return await get_group_by_id(db, group_id)


# ── Habilitar grupo ───────────────────────────────────────────────────────────

async def enable_group(
    db: AsyncSession,
    group_id: str,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede habilitar grupos")

    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.is_deleted == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundException("Grupo")

    if group.is_active:
        raise ValidationException("El grupo ya esta habilitado")

    await db.execute(
        update(Group).where(Group.id == group_id).values(is_active=True)
    )
    await db.commit()
    return await get_group_by_id(db, group_id)


# ── Deshabilitar grupo ────────────────────────────────────────────────────────

async def disable_group(
    db: AsyncSession,
    group_id: str,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede deshabilitar grupos")

    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.is_deleted == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundException("Grupo")

    if not group.is_active:
        raise ValidationException("El grupo ya esta deshabilitado")

    # Verificar que no tenga empresas activas
    active_companies = await db.execute(
        select(func.count()).where(
            Company.group_id == group_id,
            Company.is_active == True,
            Company.is_deleted == False,
        )
    )
    count = active_companies.scalar()
    if count > 0:
        raise ValidationException(
            f"No puedes deshabilitar el grupo porque tiene {count} empresa(s) activa(s). "
            "Deshabilita primero todas sus empresas."
        )

    await db.execute(
        update(Group).where(Group.id == group_id).values(is_active=False)
    )
    await db.commit()
    return await get_group_by_id(db, group_id)


# ── Eliminar grupo (soft delete) ──────────────────────────────────────────────

async def delete_group(
    db: AsyncSession,
    group_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar grupos")

    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.is_deleted == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundException("Grupo")

    active_companies = await db.execute(
        select(func.count()).where(
            Company.group_id == group_id,
            Company.is_deleted == False,
        )
    )
    if active_companies.scalar() > 0:
        raise ValidationException(
            "No puedes eliminar un grupo que tiene empresas asociadas"
        )

    await db.execute(
        update(Group).where(Group.id == group_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
            is_active=False,
        )
    )
    await db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_group(group: Group) -> Dict[str, Any]:
    return {
        "group_id": str(group.id),
        "name": group.name,
        "slug": group.slug,
        "description": group.description,
        "is_active": group.is_active,
        "created_at": group.created_at.isoformat(),
    }


def _is_global_admin(payload: Optional[Dict[str, Any]]) -> bool:
    if not payload:
        return False
    return "super_admin" in payload.get("roles", [])