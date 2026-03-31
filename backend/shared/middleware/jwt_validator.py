from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any, Dict, List, Optional
from shared.utils.jwt import decode_access_token
from shared.exceptions.http_exceptions import UnauthorizedException, ForbiddenException

bearer_scheme = HTTPBearer(auto_error=False)


# ── Extraccion del token ──────────────────────────────────────────────────────

def get_token_from_request(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise UnauthorizedException("Token de acceso requerido")
    return credentials.credentials


# ── Dependencias de autenticacion ─────────────────────────────────────────────

class JWTValidator:

    def __init__(self, secret_key: str, algorithm: str):
        self.secret_key = secret_key
        self.algorithm = algorithm

    def get_current_user(self) -> Any:
        def dependency(token: str = Depends(get_token_from_request)) -> Dict[str, Any]:
            return decode_access_token(token, self.secret_key, self.algorithm)
        return dependency

    def require_roles(self, allowed_roles: List[str]) -> Any:
        def dependency(payload: Dict[str, Any] = Depends(self.get_current_user())) -> Dict[str, Any]:
            user_roles = payload.get("roles", [])
            if not any(role in allowed_roles for role in user_roles):
                raise ForbiddenException(
                    f"Se requiere uno de los siguientes roles: {', '.join(allowed_roles)}"
                )
            return payload
        return dependency

    def require_permissions(self, required_permissions: List[str]) -> Any:
        def dependency(payload: Dict[str, Any] = Depends(self.get_current_user())) -> Dict[str, Any]:
            user_permissions = payload.get("permissions", [])
            missing = [p for p in required_permissions if p not in user_permissions]
            if missing:
                raise ForbiddenException(
                    f"Permisos faltantes: {', '.join(missing)}"
                )
            return payload
        return dependency

    def require_module_access(self, module_key: str) -> Any:
        def dependency(payload: Dict[str, Any] = Depends(self.get_current_user())) -> Dict[str, Any]:
            modules = payload.get("modules", [])
            if module_key not in modules:
                raise ForbiddenException(
                    f"No tienes acceso al modulo: {module_key}"
                )
            return payload
        return dependency