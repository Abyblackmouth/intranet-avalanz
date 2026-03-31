from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from typing import Any, Optional


# ── Clase base ────────────────────────────────────────────────────────────────

class AppException(HTTPException):
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        detail: Optional[Any] = None,
    ):
        self.error_code = error_code
        self.message = message
        self.detail = detail
        super().__init__(status_code=status_code, detail=message)


# ── Autenticacion ─────────────────────────────────────────────────────────────

class UnauthorizedException(AppException):
    def __init__(self, message: str = "No autenticado", detail: Optional[Any] = None):
        super().__init__(
            status_code=401,
            error_code="UNAUTHORIZED",
            message=message,
            detail=detail,
        )


class InvalidTokenException(AppException):
    def __init__(self, message: str = "Token invalido o expirado", detail: Optional[Any] = None):
        super().__init__(
            status_code=401,
            error_code="INVALID_TOKEN",
            message=message,
            detail=detail,
        )


class TwoFactorRequiredException(AppException):
    def __init__(self, message: str = "Se requiere verificacion de doble factor", detail: Optional[Any] = None):
        super().__init__(
            status_code=401,
            error_code="2FA_REQUIRED",
            message=message,
            detail=detail,
        )


class InvalidTwoFactorCodeException(AppException):
    def __init__(self, message: str = "Codigo 2FA invalido", detail: Optional[Any] = None):
        super().__init__(
            status_code=401,
            error_code="INVALID_2FA_CODE",
            message=message,
            detail=detail,
        )


# ── Autorizacion ──────────────────────────────────────────────────────────────

class ForbiddenException(AppException):
    def __init__(self, message: str = "No tienes permisos para realizar esta accion", detail: Optional[Any] = None):
        super().__init__(
            status_code=403,
            error_code="FORBIDDEN",
            message=message,
            detail=detail,
        )


class InsufficientPermissionsException(AppException):
    def __init__(self, message: str = "Permisos insuficientes", detail: Optional[Any] = None):
        super().__init__(
            status_code=403,
            error_code="INSUFFICIENT_PERMISSIONS",
            message=message,
            detail=detail,
        )


# ── Recursos ──────────────────────────────────────────────────────────────────

class NotFoundException(AppException):
    def __init__(self, resource: str = "Recurso", detail: Optional[Any] = None):
        super().__init__(
            status_code=404,
            error_code="NOT_FOUND",
            message=f"{resource} no encontrado",
            detail=detail,
        )


class AlreadyExistsException(AppException):
    def __init__(self, resource: str = "Recurso", detail: Optional[Any] = None):
        super().__init__(
            status_code=409,
            error_code="ALREADY_EXISTS",
            message=f"{resource} ya existe",
            detail=detail,
        )


# ── Validacion ────────────────────────────────────────────────────────────────

class ValidationException(AppException):
    def __init__(self, message: str = "Error de validacion", detail: Optional[Any] = None):
        super().__init__(
            status_code=422,
            error_code="VALIDATION_ERROR",
            message=message,
            detail=detail,
        )


# ── Rate Limit ────────────────────────────────────────────────────────────────

class RateLimitException(AppException):
    def __init__(self, message: str = "Demasiadas solicitudes, intenta mas tarde", detail: Optional[Any] = None):
        super().__init__(
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            message=message,
            detail=detail,
        )


# ── Servidor ──────────────────────────────────────────────────────────────────

class InternalServerException(AppException):
    def __init__(self, message: str = "Error interno del servidor", detail: Optional[Any] = None):
        super().__init__(
            status_code=500,
            error_code="INTERNAL_SERVER_ERROR",
            message=message,
            detail=detail,
        )


class ServiceUnavailableException(AppException):
    def __init__(self, service: str = "Servicio", detail: Optional[Any] = None):
        super().__init__(
            status_code=503,
            error_code="SERVICE_UNAVAILABLE",
            message=f"{service} no disponible en este momento",
            detail=detail,
        )


# ── Almacenamiento ────────────────────────────────────────────────────────────

class StorageException(AppException):
    def __init__(self, message: str = "Error en el servicio de almacenamiento", detail: Optional[Any] = None):
        super().__init__(
            status_code=500,
            error_code="STORAGE_ERROR",
            message=message,
            detail=detail,
        )


class FileTooLargeException(AppException):
    def __init__(self, max_size_mb: int = 10, detail: Optional[Any] = None):
        super().__init__(
            status_code=413,
            error_code="FILE_TOO_LARGE",
            message=f"El archivo supera el tamano maximo permitido de {max_size_mb}MB",
            detail=detail,
        )


class InvalidFileTypeException(AppException):
    def __init__(self, message: str = "Tipo de archivo no permitido", detail: Optional[Any] = None):
        super().__init__(
            status_code=415,
            error_code="INVALID_FILE_TYPE",
            message=message,
            detail=detail,
        )


# ── Handlers globales para registrar en cada servicio ────────────────────────

async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error_code": exc.error_code,
            "message": exc.message,
            "detail": exc.detail,
            "path": str(request.url.path),
        },
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error_code": "HTTP_ERROR",
            "message": str(exc.detail),
            "detail": None,
            "path": str(request.url.path),
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for error in exc.errors():
        errors.append({
            "field": " -> ".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        })
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error_code": "VALIDATION_ERROR",
            "message": "Error en los datos enviados",
            "detail": errors,
            "path": str(request.url.path),
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error_code": "INTERNAL_SERVER_ERROR",
            "message": "Error interno del servidor",
            "detail": None,
            "path": str(request.url.path),
        },
    )