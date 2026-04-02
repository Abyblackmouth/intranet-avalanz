import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, List, Dict, Any
from datetime import timedelta

from app.config import config
from app.models.admin_models import User, Company, UserGlobalRole, UserModuleAccess, GlobalRole, Module, ModuleRole
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
    matricula: Optional[str] = None,
    puesto: Optional[str] = None,
    departamento: Optional[str] = None,
    is_super_admin: bool = False,
    requested_by: Dict[str, Any] = None,
) -> Dict[str, Any]:

    if is_super_admin and not _is_global_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear otros super admins")

    result = await db.execute(
        select(User).where(User.email == email, User.is_deleted == False)
    )
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Email")

    if matricula:
        result = await db.execute(
            select(User).where(User.matricula == matricula, User.is_deleted == False)
        )
        if result.scalar_one_or_none():
            raise AlreadyExistsException("Matricula")

    temp_password = generate_secure_token(config.TEMP_PASSWORD_LENGTH)
    expires_at = now_utc() + timedelta(hours=config.TEMP_PASSWORD_EXPIRE_HOURS)

    user = User(
        company_id=company_id,
        email=email,
        full_name=full_name,
        matricula=matricula,
        puesto=puesto,
        departamento=departamento,
        is_active=True,
        is_super_admin=is_super_admin,
    )
    db.add(user)
    await db.flush()

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
        "matricula": matricula,
        "puesto": puesto,
        "departamento": departamento,
        "temp_password": temp_password,
        "temp_password_expires_at": expires_at.isoformat(),
        "message": "Usuario creado. La contrasena temporal tiene validez de 24 horas",
    }


# ── Obtener usuario ───────────────────────────────────────────────────────────

async def get_user_by_id(db: AsyncSession, user_id: str) -> Dict[str, Any]:
    result = await db.execute(
        select(User, Company)
        .join(Company, User.company_id == Company.id)
        .where(User.id == user_id, User.is_deleted == False)
    )
    row = result.first()
    if not row:
        raise NotFoundException("Usuario")
    user, company = row
    auth_data = await _get_auth_data(str(user.id))
    return _serialize_user(user, company.nombre_comercial, auth_data)


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

    query = (
        select(User, Company)
        .join(Company, User.company_id == Company.id)
        .where(User.is_deleted == False)
    )

    if not _is_global_admin(requested_by):
        query = query.where(User.company_id == requested_by.get("company_id"))
    elif company_id:
        query = query.where(User.company_id == company_id)

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    if search:
        query = query.where(
            User.full_name.ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%") |
            User.matricula.ilike(f"%{search}%")
        )

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    rows = result.all()

    # Obtener datos del auth-service en batch
    user_ids = [str(row.User.id) for row in rows]
    auth_data_map = await _get_auth_data_batch(user_ids)

    # Obtener roles globales de todos los usuarios en un solo query
    if rows:
        roles_result = await db.execute(
            select(UserGlobalRole, GlobalRole)
            .join(GlobalRole, UserGlobalRole.role_id == GlobalRole.id)
            .where(
                UserGlobalRole.user_id.in_(user_ids),
                GlobalRole.is_active == True,
                GlobalRole.is_deleted == False,
            )
        )
        roles_rows = roles_result.all()
        roles_map = {}
        for rrow in roles_rows:
            uid = str(rrow.UserGlobalRole.user_id)
            if uid not in roles_map:
                roles_map[uid] = []
            roles_map[uid].append(rrow.GlobalRole.slug)

        # Agregar super_admin si is_super_admin
        for row in rows:
            uid = str(row.User.id)
            if row.User.is_super_admin:
                if uid not in roles_map:
                    roles_map[uid] = []
                if "super_admin" not in roles_map[uid]:
                    roles_map[uid].append("super_admin")
    else:
        roles_map = {}

    return {
        "data": [
            _serialize_user(
                row.User,
                row.Company.nombre_comercial,
                auth_data_map.get(str(row.User.id), {}),
                roles_map.get(str(row.User.id), [])
            )
            for row in rows
        ],
        "meta": paginate(total, page, per_page),
    }


# ── Actualizar usuario ────────────────────────────────────────────────────────

async def update_user(
    db: AsyncSession,
    user_id: str,
    full_name: Optional[str] = None,
    matricula: Optional[str] = None,
    puesto: Optional[str] = None,
    departamento: Optional[str] = None,
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

    if matricula and matricula != user.matricula:
        result = await db.execute(
            select(User).where(
                User.matricula == matricula,
                User.is_deleted == False,
                User.id != user_id,
            )
        )
        if result.scalar_one_or_none():
            raise AlreadyExistsException("Matricula")

    values = {}
    if full_name is not None:
        values["full_name"] = full_name
    if matricula is not None:
        values["matricula"] = matricula
    if puesto is not None:
        values["puesto"] = puesto
    if departamento is not None:
        values["departamento"] = departamento
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


# ── Permisos del usuario ──────────────────────────────────────────────────────

async def get_user_permissions(db: AsyncSession, user_id: str) -> Dict[str, Any]:
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

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

def _serialize_user(user: User, company_name: str = "", auth_data: Dict = {}, roles: List = []) -> Dict[str, Any]:
    return {
        "user_id": str(user.id),
        "company_id": str(user.company_id),
        "company_name": company_name,
        "email": user.email,
        "full_name": user.full_name,
        "matricula": user.matricula,
        "puesto": user.puesto,
        "departamento": user.departamento,
        "is_active": user.is_active,
        "is_super_admin": user.is_super_admin,
        "roles": roles,
        "is_locked": auth_data.get("is_locked", False),
        "is_2fa_configured": auth_data.get("is_2fa_configured", False),
        "last_login_at": auth_data.get("last_login_at", None),
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


async def _get_auth_data(user_id: str) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"http://auth-service:8000/internal/users/{user_id}/info"
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {}


async def _get_auth_data_batch(user_ids: List[str]) -> Dict[str, Dict]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                "http://auth-service:8000/internal/users/batch-info",
                json={"user_ids": user_ids}
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {}


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
                "http://auth-service:8000/internal/users",
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
