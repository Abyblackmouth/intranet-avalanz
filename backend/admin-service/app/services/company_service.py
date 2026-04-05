from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, Dict, Any

from app.config import config
from app.models.admin_models import Company, Group, User, UserModuleAccess
from shared.utils.helpers import paginate, get_offset, slugify, now_utc
from shared.exceptions.http_exceptions import (
    NotFoundException,
    AlreadyExistsException,
    ForbiddenException,
    ValidationException,
)


# ── Crear empresa ─────────────────────────────────────────────────────────────

async def create_company(
    db: AsyncSession,
    group_id: str,
    nombre_comercial: str,
    name: str,
    rfc: Optional[str] = None,
    description: Optional[str] = None,
    is_active: bool = True,
    calle: Optional[str] = None,
    num_ext: Optional[str] = None,
    num_int: Optional[str] = None,
    colonia: Optional[str] = None,
    cp: Optional[str] = None,
    municipio: Optional[str] = None,
    estado: Optional[str] = None,
    constancia_fecha_emision: Optional[str] = None,
    constancia_fecha_vigencia: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear empresas")

    # Verificar que el grupo existe y esta activo
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.is_deleted == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundException("Grupo")
    if not group.is_active:
        raise ValidationException("No puedes agregar empresas a un grupo deshabilitado")

    slug = slugify(nombre_comercial)

    existing = await db.execute(
        select(Company).where(Company.slug == slug, Company.is_deleted == False)
    )
    if existing.scalar_one_or_none():
        raise AlreadyExistsException(f"Empresa con slug '{slug}'")

    if rfc:
        existing_rfc = await db.execute(
            select(Company).where(Company.rfc == rfc, Company.is_deleted == False)
        )
        if existing_rfc.scalar_one_or_none():
            raise AlreadyExistsException(f"Empresa con RFC '{rfc}'")

    company = Company(
        group_id=group_id,
        nombre_comercial=nombre_comercial,
        name=name,
        slug=slug,
        rfc=rfc,
        description=description,
        is_active=is_active,
        calle=calle,
        num_ext=num_ext,
        num_int=num_int,
        colonia=colonia,
        cp=cp,
        municipio=municipio,
        estado=estado,
        constancia_fecha_emision=constancia_fecha_emision,
        constancia_fecha_vigencia=constancia_fecha_vigencia,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)

    return _serialize_company(company)


# ── Obtener empresa ───────────────────────────────────────────────────────────

async def get_company_by_id(
    db: AsyncSession,
    company_id: str,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.is_deleted == False)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise NotFoundException("Empresa")

    if not _is_global_admin(requested_by):
        if requested_by.get("company_id") != str(company.id):
            raise ForbiddenException("No tienes acceso a esta empresa")

    return _serialize_company(company)


# ── Listar empresas ───────────────────────────────────────────────────────────

async def list_companies(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    group_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(Company).where(Company.is_deleted == False)

    if not _is_global_admin(requested_by):
        query = query.where(Company.id == requested_by.get("company_id"))
    else:
        if group_id:
            query = query.where(Company.group_id == group_id)
        if is_active is not None:
            query = query.where(Company.is_active == is_active)
        if search:
            query = query.where(
                Company.nombre_comercial.ilike(f"%{search}%") |
                Company.name.ilike(f"%{search}%") |
                Company.rfc.ilike(f"%{search}%")
            )

    query = query.order_by(Company.nombre_comercial.asc())

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    companies = result.scalars().all()

    return {
        "data": [_serialize_company(c) for c in companies],
        "meta": paginate(total, page, per_page),
    }


# ── Actualizar empresa ────────────────────────────────────────────────────────

async def update_company(
    db: AsyncSession,
    company_id: str,
    nombre_comercial: Optional[str] = None,
    name: Optional[str] = None,
    rfc: Optional[str] = None,
    description: Optional[str] = None,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede modificar empresas")

    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.is_deleted == False)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise NotFoundException("Empresa")

    values = {}
    if nombre_comercial is not None:
        new_slug = slugify(nombre_comercial)
        existing = await db.execute(
            select(Company).where(
                Company.slug == new_slug,
                Company.id != company_id,
                Company.is_deleted == False,
            )
        )
        if existing.scalar_one_or_none():
            raise AlreadyExistsException(f"Empresa con slug '{new_slug}'")
        values["nombre_comercial"] = nombre_comercial
        values["slug"] = new_slug
    if name is not None:
        values["name"] = name
    if rfc is not None:
        existing_rfc = await db.execute(
            select(Company).where(
                Company.rfc == rfc,
                Company.id != company_id,
                Company.is_deleted == False,
            )
        )
        if existing_rfc.scalar_one_or_none():
            raise AlreadyExistsException(f"Empresa con RFC '{rfc}'")
        values["rfc"] = rfc
    if description is not None:
        values["description"] = description

    if values:
        await db.execute(update(Company).where(Company.id == company_id).values(**values))
        await db.commit()

    return await get_company_by_id(db, company_id, requested_by)


# ── Habilitar empresa ─────────────────────────────────────────────────────────

async def enable_company(
    db: AsyncSession,
    company_id: str,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede habilitar empresas")

    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.is_deleted == False)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise NotFoundException("Empresa")

    if company.is_active:
        raise ValidationException("La empresa ya esta habilitada")

    # Verificar que el grupo este activo
    group_result = await db.execute(
        select(Group).where(Group.id == company.group_id, Group.is_deleted == False)
    )
    group = group_result.scalar_one_or_none()
    if group and not group.is_active:
        raise ValidationException(
            "No puedes habilitar una empresa cuyo grupo esta deshabilitado"
        )

    await db.execute(
        update(Company).where(Company.id == company_id).values(is_active=True)
    )
    await db.commit()
    return await get_company_by_id(db, company_id, requested_by)


# ── Deshabilitar empresa ──────────────────────────────────────────────────────

async def disable_company(
    db: AsyncSession,
    company_id: str,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede deshabilitar empresas")

    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.is_deleted == False)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise NotFoundException("Empresa")

    if not company.is_active:
        raise ValidationException("La empresa ya esta deshabilitada")

    # Verificar usuarios activos
    active_users = await db.execute(
        select(func.count()).where(
            User.company_id == company_id,
            User.is_active == True,
            User.is_deleted == False,
        )
    )
    count = active_users.scalar()
    if count > 0:
        raise ValidationException(
            f"No puedes deshabilitar la empresa porque tiene {count} usuario(s) activo(s). "
            "Desactiva primero todos sus usuarios."
        )

    await db.execute(
        update(Company).where(Company.id == company_id).values(is_active=False)
    )
    await db.commit()
    return await get_company_by_id(db, company_id, requested_by)


# ── Eliminar empresa (soft delete) ────────────────────────────────────────────

async def delete_company(
    db: AsyncSession,
    company_id: str,
    requested_by: Dict[str, Any] = None,
) -> None:

    if not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede eliminar empresas")

    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.is_deleted == False)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise NotFoundException("Empresa")

    users_count = await db.execute(
        select(func.count()).where(
            User.company_id == company_id,
            User.is_deleted == False,
        )
    )
    if users_count.scalar() > 0:
        raise ValidationException(
            "No puedes eliminar una empresa que tiene usuarios asociados"
        )

    await db.execute(
        update(Company).where(Company.id == company_id).values(
            is_deleted=True,
            deleted_at=now_utc(),
            is_active=False,
        )
    )
    await db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_company(company: Company) -> Dict[str, Any]:
    return {
        "company_id": str(company.id),
        "group_id": str(company.group_id),
        "nombre_comercial": company.nombre_comercial,
        "name": company.name,
        "slug": company.slug,
        "rfc": company.rfc,
        "description": company.description,
        "is_active": company.is_active,
        "calle": company.calle,
        "num_ext": company.num_ext,
        "num_int": company.num_int,
        "colonia": company.colonia,
        "cp": company.cp,
        "municipio": company.municipio,
        "estado": company.estado,
        "constancia_fecha_emision": company.constancia_fecha_emision,
        "constancia_fecha_vigencia": company.constancia_fecha_vigencia,
        "created_at": company.created_at.isoformat(),
    }


def _is_global_admin(payload: Optional[Dict[str, Any]]) -> bool:
    if not payload:
        return False
    return "super_admin" in payload.get("roles", [])