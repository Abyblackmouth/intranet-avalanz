import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, List, Dict, Any
from datetime import timedelta

from app.config import config
from app.models.admin_models import User, Company, UserGlobalRole, UserModuleAccess, GlobalRole, Module, ModuleRole, Submodule
from shared.utils.encryption import generate_secure_token
from shared.utils.helpers import now_utc, paginate, get_offset
from shared.exceptions.http_exceptions import (
    NotFoundException, AlreadyExistsException, ValidationException, ForbiddenException,
)

PROTECTED_SUPER_ADMIN_EMAIL = "admin@avalanz.com"


async def create_user(db, company_id, email, full_name, matricula=None, puesto=None, departamento=None, is_super_admin=False, requested_by=None):
    if is_super_admin and not _is_super_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede crear otros super admins")
    result = await db.execute(select(User).where(User.email == email, User.is_deleted == False))
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Email")
    if matricula:
        result = await db.execute(select(User).where(User.matricula == matricula, User.is_deleted == False))
        if result.scalar_one_or_none():
            raise AlreadyExistsException("Matricula")
    temp_password = generate_secure_token(config.TEMP_PASSWORD_LENGTH)
    expires_at = now_utc() + timedelta(hours=config.TEMP_PASSWORD_EXPIRE_HOURS)
    user = User(company_id=company_id, email=email, full_name=full_name, matricula=matricula, puesto=puesto, departamento=departamento, is_active=True, is_super_admin=is_super_admin)
    db.add(user)
    await db.flush()
    await _sync_user_to_auth(str(user.id), email, full_name, temp_password, expires_at.isoformat())
    await _send_welcome_email(email, full_name, temp_password, str(user.id))
    await db.commit()
    return {"user_id": str(user.id), "email": email, "full_name": full_name, "matricula": matricula, "puesto": puesto, "departamento": departamento, "temp_password": temp_password, "temp_password_expires_at": expires_at.isoformat(), "message": "Usuario creado. La contrasena temporal tiene validez de 24 horas"}


async def get_user_by_id(db, user_id):
    result = await db.execute(select(User, Company).join(Company, User.company_id == Company.id).where(User.id == user_id, User.is_deleted == False))
    row = result.first()
    if not row:
        raise NotFoundException("Usuario")
    user, company = row
    auth_data = await _get_auth_data(str(user.id))
    roles = await _get_user_roles(db, str(user.id), user.is_super_admin)
    return _serialize_user(user, company.nombre_comercial, auth_data, roles)


async def list_users(db, page=1, per_page=20, company_id=None, is_active=None, search=None, requested_by=None):
    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(User, Company).join(Company, User.company_id == Company.id).where(User.is_deleted == False)

    # super_admin y admin_empresa ven todos los usuarios — filtro opcional por empresa
    if company_id and _is_super_admin(requested_by):
        query = query.where(User.company_id == company_id)

    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if search:
        query = query.where(User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%") | User.matricula.ilike(f"%{search}%"))
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()
    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    rows = result.all()
    user_ids = [str(row.User.id) for row in rows]
    auth_data_map = await _get_auth_data_batch(user_ids)
    roles_map: Dict[str, List[str]] = {}
    if rows:
        roles_result = await db.execute(select(UserGlobalRole, GlobalRole).join(GlobalRole, UserGlobalRole.role_id == GlobalRole.id).where(UserGlobalRole.user_id.in_(user_ids), GlobalRole.is_active == True, GlobalRole.is_deleted == False))
        for rrow in roles_result.all():
            uid = str(rrow.UserGlobalRole.user_id)
            if uid not in roles_map:
                roles_map[uid] = []
            roles_map[uid].append(rrow.GlobalRole.slug)
        # Incluir roles de modulo para usuarios sin rol global
        module_roles_result = await db.execute(
            select(UserModuleAccess, ModuleRole)
            .join(ModuleRole, UserModuleAccess.role_id == ModuleRole.id)
            .where(
                UserModuleAccess.user_id.in_(user_ids),
                UserModuleAccess.is_active == True,
                ModuleRole.is_deleted == False,
            )
        )
        for mrow in module_roles_result.all():
            uid = str(mrow.UserModuleAccess.user_id)
            if uid not in roles_map or len(roles_map[uid]) == 0:
                if uid not in roles_map:
                    roles_map[uid] = []
                if mrow.ModuleRole.name not in roles_map[uid]:
                    roles_map[uid].append(mrow.ModuleRole.name)
        for row in rows:
            uid = str(row.User.id)
            if row.User.is_super_admin:
                if uid not in roles_map:
                    roles_map[uid] = []
                if "super_admin" not in roles_map[uid]:
                    roles_map[uid].append("super_admin")
    return {"data": [_serialize_user(row.User, row.Company.nombre_comercial, auth_data_map.get(str(row.User.id), {}), roles_map.get(str(row.User.id), [])) for row in rows], "meta": paginate(total, page, per_page)}


async def update_user(db, user_id, full_name=None, email=None, matricula=None, puesto=None, departamento=None, is_active=None, requested_by=None):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    if user.email == PROTECTED_SUPER_ADMIN_EMAIL:
        raise ForbiddenException("Este usuario no puede ser modificado")
    if not _is_super_admin(requested_by) and not _is_admin_empresa(requested_by):
        raise ForbiddenException("No tienes permisos para editar usuarios")
    # admin_empresa no puede modificar matricula
    if matricula is not None and not _is_super_admin(requested_by):
        raise ForbiddenException("No tienes permisos para modificar la matricula")
    if matricula and matricula != user.matricula:
        result = await db.execute(select(User).where(User.matricula == matricula, User.is_deleted == False, User.id != user_id))
        if result.scalar_one_or_none():
            raise AlreadyExistsException("Matricula")
    values = {}
    if full_name is not None: values["full_name"] = full_name
    if email is not None: values["email"] = email
    if matricula is not None: values["matricula"] = matricula
    if puesto is not None: values["puesto"] = puesto
    if departamento is not None: values["departamento"] = departamento
    if is_active is not None: values["is_active"] = is_active
    if values:
        await db.execute(update(User).where(User.id == user.id).values(**values))
        await db.commit()
    return await get_user_by_id(db, user_id)


async def toggle_lock_user(db, user_id, lock, reason, requested_by=None):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    if user.email == PROTECTED_SUPER_ADMIN_EMAIL:
        raise ForbiddenException("Este usuario no puede ser bloqueado")
    # admin_empresa no puede bloquear a un super_admin
    if user.is_super_admin and not _is_super_admin(requested_by):
        raise ForbiddenException("No tienes permisos para bloquear a un super administrador")
    if not _is_super_admin(requested_by) and not _is_admin_empresa(requested_by):
        raise ForbiddenException("No tienes permisos para bloquear usuarios")
    if not reason or not reason.strip():
        raise ValidationException("El motivo es requerido")
    await db.execute(update(User).where(User.id == user.id).values(lock_reason=reason.strip()))
    await db.commit()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"http://auth-service:8000/api/v1/auth/internal/users/{user_id}/lock", json={"lock": lock, "reason": reason.strip()})
    except Exception:
        raise ValidationException("Error al comunicarse con el servicio de autenticacion")
    return await get_user_by_id(db, user_id)


async def delete_user(db, user_id, requested_by=None):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    if user.email == PROTECTED_SUPER_ADMIN_EMAIL:
        raise ForbiddenException("Este usuario no puede ser eliminado")
    if not _is_super_admin(requested_by):
        raise ForbiddenException("No tienes permisos para eliminar usuarios")
    await db.execute(update(User).where(User.id == user.id).values(is_deleted=True, deleted_at=now_utc(), is_active=False))
    await db.commit()


async def reset_password(db, user_id, new_password, requested_by=None):
    from shared.utils.helpers import is_strong_password

    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    if user.email == PROTECTED_SUPER_ADMIN_EMAIL:
        raise ForbiddenException("Este usuario no puede ser modificado")
    if not _is_super_admin(requested_by) and not _is_admin_empresa(requested_by):
        raise ForbiddenException("No tienes permisos para resetear contrasenas")
    if not is_strong_password(new_password):
        raise ValidationException(
            "La contrasena debe tener minimo 8 caracteres, una mayuscula, "
            "una minuscula, un numero y un caracter especial"
        )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"http://auth-service:8000/api/v1/auth/internal/users/{user_id}/reset-password",
                json={"new_password": new_password},
            )
            if resp.status_code != 200 or not resp.json().get("success"):
                raise ValidationException("Error al resetear la contrasena")
    except httpx.HTTPError:
        raise ValidationException("Error al comunicarse con el servicio de autenticacion")
    await _send_reset_password_email(user.email, user.full_name, str(user.id))


async def assign_global_role(db, user_id, role_id, requested_by=None):
    if not _is_super_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede asignar roles globales")
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    if not result.scalar_one_or_none():
        raise NotFoundException("Usuario")
    result = await db.execute(select(GlobalRole).where(GlobalRole.id == role_id, GlobalRole.is_deleted == False))
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol global")
    result = await db.execute(select(UserGlobalRole).where(UserGlobalRole.user_id == user_id, UserGlobalRole.role_id == role_id))
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Asignacion de rol global")
    db.add(UserGlobalRole(user_id=user_id, role_id=role_id))
    await db.commit()


async def assign_module_access(db, user_id, module_id, role_id, requested_by=None):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    if not _is_super_admin(requested_by) and not _is_admin_empresa(requested_by):
        raise ForbiddenException("No tienes permisos para asignar acceso a modulos")
    result = await db.execute(select(Module).where(Module.id == module_id, Module.is_deleted == False))
    if not result.scalar_one_or_none():
        raise NotFoundException("Modulo")
    # El rol puede ser del catálogo general (sin module_id) o específico del módulo
    result = await db.execute(
        select(ModuleRole).where(
            ModuleRole.id == role_id,
            ModuleRole.is_deleted == False,
            ModuleRole.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundException("Rol operativo")
    result = await db.execute(select(UserModuleAccess).where(UserModuleAccess.user_id == user_id, UserModuleAccess.module_id == module_id))
    if result.scalar_one_or_none():
        raise AlreadyExistsException("Acceso al modulo")
    db.add(UserModuleAccess(user_id=user_id, module_id=module_id, role_id=role_id))
    await db.commit()


async def revoke_module_access(db, user_id, module_id, requested_by=None):
    result = await db.execute(select(UserModuleAccess).where(UserModuleAccess.user_id == user_id, UserModuleAccess.module_id == module_id))
    if not result.scalar_one_or_none():
        raise NotFoundException("Acceso al modulo")
    if not _is_super_admin(requested_by) and not _is_admin_empresa(requested_by):
        raise ForbiddenException("No tienes permisos para revocar acceso a modulos")
    await db.execute(update(UserModuleAccess).where(UserModuleAccess.user_id == user_id, UserModuleAccess.module_id == module_id).values(is_active=False))
    await db.commit()


async def get_user_permissions(db, user_id):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    global_roles = await _get_user_roles(db, user_id, user.is_super_admin)

    # Super admin obtiene acceso a todos los modulos activos automaticamente
    if user.is_super_admin:
        all_modules_result = await db.execute(
            select(Module).where(Module.is_active == True, Module.is_deleted == False)
        )
        all_modules = all_modules_result.scalars().all()
        modules_with_subs = []
        for m in all_modules:
            subs_result = await db.execute(
                select(Submodule).where(
                    Submodule.module_id == m.id,
                    Submodule.is_active == True,
                    Submodule.is_deleted == False,
                ).order_by(Submodule.order.asc())
            )
            subs = subs_result.scalars().all()
            modules_with_subs.append({
                "slug": m.slug,
                "icon": m.icon,
                "submodules": [{"slug": s.slug, "icon": s.icon, "name": s.name} for s in subs],
            })
        return {
            "roles": global_roles,
            "modules": modules_with_subs,
            "companies": list(set([str(m.company_id) for m in all_modules])),
            "permissions": [],
            "cross_company": True,
        }

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
    modules_with_subs = []
    for a in accesses:
        subs_result = await db.execute(
            select(Submodule).where(
                Submodule.module_id == a.Module.id,
                Submodule.is_active == True,
                Submodule.is_deleted == False,
            ).order_by(Submodule.order.asc())
        )
        subs = subs_result.scalars().all()
        modules_with_subs.append({
            "slug": a.Module.slug,
            "icon": a.Module.icon,
            "submodules": [{"slug": s.slug, "icon": s.icon, "name": s.name} for s in subs],
        })

    # cross_company es True si alguno de los roles del usuario tiene scope corporativo
    cross_company = any(a.ModuleRole.scope == "corporativo" for a in accesses)

    return {
        "roles": global_roles + [f"{a.Module.slug}:{a.ModuleRole.slug}" for a in accesses],
        "modules": modules_with_subs,
        "companies": list(set([str(a.Module.company_id) for a in accesses])),
        "permissions": [],
        "cross_company": cross_company,
    }


async def remove_global_role(db, user_id, role_id, requested_by=None):
    if not _is_super_admin(requested_by):
        raise ForbiddenException("Solo un super admin puede remover roles globales")
    result = await db.execute(select(UserGlobalRole).where(UserGlobalRole.user_id == user_id, UserGlobalRole.role_id == role_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        return
    await db.execute(UserGlobalRole.__table__.delete().where(UserGlobalRole.user_id == user_id, UserGlobalRole.role_id == role_id))
    await db.commit()


def _serialize_user(user, company_name="", auth_data={}, roles=[]):
    return {
        "user_id": str(user.id),
        "company_id": str(user.company_id),
        "company_name": company_name,
        "email": user.email,
        "full_name": user.full_name,
        "matricula": user.matricula,
        "puesto": user.puesto,
        "departamento": user.departamento,
        "lock_reason": user.lock_reason,
        "is_active": user.is_active,
        "is_super_admin": user.is_super_admin,
        "is_protected": user.email == PROTECTED_SUPER_ADMIN_EMAIL,
        "roles": roles,
        "is_locked": auth_data.get("is_locked", False),
        "is_2fa_configured": auth_data.get("is_2fa_configured", False),
        "last_login_at": auth_data.get("last_login_at", None),
        "created_at": user.created_at.isoformat(),
    }


def _is_super_admin(payload):
    if not payload:
        return False
    return "super_admin" in payload.get("roles", [])


def _is_admin_empresa(payload):
    if not payload:
        return False
    return "admin_empresa" in payload.get("roles", [])


def _check_company_scope(payload, target_company_id):
    if not payload:
        raise ForbiddenException("Sin permisos")
    if _is_super_admin(payload):
        return
    if payload.get("company_id") != target_company_id:
        raise ForbiddenException("No tienes acceso a recursos de otra empresa")


async def _get_user_roles(db, user_id, is_super_admin):
    roles_result = await db.execute(select(GlobalRole).join(UserGlobalRole).where(UserGlobalRole.user_id == user_id, GlobalRole.is_active == True, GlobalRole.is_deleted == False))
    roles = [r.slug for r in roles_result.scalars().all()]
    if is_super_admin and "super_admin" not in roles:
        roles.append("super_admin")
    return roles


async def _get_auth_data(user_id):
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"http://auth-service:8000/api/v1/auth/internal/users/{user_id}/info")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {}


async def _get_auth_data_batch(user_ids):
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post("http://auth-service:8000/api/v1/auth/internal/users/batch-info", json={"user_ids": user_ids})
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {}


async def _sync_user_to_auth(user_id, email, full_name, temp_password, temp_password_expires_at):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post("http://auth-service:8000/api/v1/auth/internal/users", json={"user_id": user_id, "email": email, "full_name": full_name, "temp_password": temp_password, "temp_password_expires_at": temp_password_expires_at})
    except Exception:
        raise ValidationException("Error al sincronizar usuario con el servicio de autenticacion")


async def _send_welcome_email(email: str, full_name: str, temp_password: str, user_id: str):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/welcome",
                json={"to_email": email, "full_name": full_name, "temp_password": temp_password, "user_id": user_id},
            )
    except Exception:
        pass


async def _send_reset_password_email(email: str, full_name: str, user_id: str):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": email,
                    "full_name": full_name,
                    "subject": "Tu contrasena ha sido reseteada",
                    "message": "Un administrador ha reseteado tu contrasena. Deberas cambiarla en tu proximo inicio de sesion.",
                    "action_label": "Iniciar sesion",
                    "action_url": f"http://localhost:3000/change-password?user_id={user_id}",
                    "alert_type": "warning",
                },
            )
    except Exception:
        pass
