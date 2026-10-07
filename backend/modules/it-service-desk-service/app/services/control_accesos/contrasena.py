"""Contrasena temporal para el correo final de una solicitud de acceso.

TI la guarda antes de firmar en DocuSign. Se guarda CIFRADA (Fernet, con una
llave derivada de JWT_SECRET_KEY) dentro de acc_solicitudes.datos["entrega"],
solo mientras se necesita: al mandar el correo final se lee y se borra. Si
falta la llave, se rehusa a guardar (nunca en texto plano).
"""
import base64
import hashlib
import os
from datetime import datetime, timezone
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    clave = os.getenv("JWT_SECRET_KEY") or ""
    if not clave:
        raise RuntimeError("Falta JWT_SECRET_KEY: no se puede cifrar la contrasena temporal")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(("acc-contrasena:" + clave).encode()).digest()))


def guardar(sol, contrasena: str, quien: str) -> None:
    token = _fernet().encrypt(contrasena.encode()).decode()
    sol.datos = {**(sol.datos or {}), "entrega": {"contrasena": token, "guardada_por": quien,
                                                  "en": datetime.now(timezone.utc).isoformat()}}


def leer(sol) -> Optional[str]:
    token = ((sol.datos or {}).get("entrega") or {}).get("contrasena")
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, RuntimeError):
        return None


def borrar(sol) -> None:
    datos = dict(sol.datos or {})
    if "entrega" in datos:
        datos.pop("entrega")
        sol.datos = datos


def tiene(sol) -> bool:
    return bool(((sol.datos or {}).get("entrega") or {}).get("contrasena"))
