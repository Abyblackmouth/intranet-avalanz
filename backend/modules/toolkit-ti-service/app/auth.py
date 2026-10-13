"""Sesion y permisos de Toolkit TI.

- super admin: todo (cuenta como dueno, sin asignarle nada)
- toolkit-ti:dueno y toolkit-ti:colaborador: ejecutan y activan/desactivan plugins
- toolkit-ti:lector: solo consulta
"""
from fastapi import HTTPException

from app.config import config
from shared.middleware.jwt_validator import JWTValidator

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()

OPERAN = {"toolkit-ti:dueno", "toolkit-ti:colaborador"}


def _roles(user: dict) -> set:
    return set(user.get("roles") or [])


def puede_ver(user: dict) -> bool:
    r = _roles(user)
    return "super_admin" in r or any(x.startswith("toolkit-ti:") for x in r)


def puede_operar(user: dict) -> bool:
    r = _roles(user)
    return "super_admin" in r or bool(r & OPERAN)


def exigir_ver(user: dict) -> None:
    if not puede_ver(user):
        raise HTTPException(status_code=403, detail="No tienes acceso a Toolkit TI")


def exigir_operar(user: dict) -> None:
    if not puede_operar(user):
        raise HTTPException(status_code=403, detail="Tu rol en Toolkit TI es de solo consulta")
