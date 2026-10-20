"""Autenticacion del modulo: valida el JWT de la plataforma y normaliza los roles.

Los roles de modulo viajan como "workflows:{slug}"; aqui se les quita el prefijo
antes de comparar (ver docs/architecture/politica-roles-permisos.md).
"""
from typing import Any, Dict, List

from fastapi import Depends, HTTPException
from shared.middleware.jwt_validator import JWTValidator

from app.config import config

MODULE_SLUG = "workflows"

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()


def get_flat_roles(user: Dict[str, Any]) -> List[str]:
    """Quita el prefijo {modulo}: de los roles de modulo para poder compararlos."""
    return [r.split(":")[-1] for r in (user.get("roles") or [])]


def es_super_admin(user: Dict[str, Any]) -> bool:
    return bool(user.get("is_super_admin")) or "super_admin" in get_flat_roles(user)


def tiene_rol(user: Dict[str, Any], *roles: str) -> bool:
    """True si es super admin o tiene alguno de los roles de modulo indicados."""
    if es_super_admin(user):
        return True
    propios = set(get_flat_roles(user))
    return any(r in propios for r in roles)


def require_super_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not es_super_admin(user):
        raise HTTPException(status_code=403, detail="Solo el super admin puede hacer esto")
    return user


def require_roles(*roles: str):
    """Dependencia: super admin o alguno de los roles de modulo indicados."""
    def dependency(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if not tiene_rol(user, *roles):
            raise HTTPException(status_code=403, detail=f"Se requiere uno de: {', '.join(roles)}")
        return user
    return dependency
