from fastapi import APIRouter, Depends, UploadFile, File, Form, Request
from typing import Optional

from app.config import config
from app.services.user_file_service import (
    upload_user_file,
    list_user_files,
    get_download_url,
    delete_user_file,
    list_file_audit,
)
from app.database import get_db
from shared.models.responses import DataResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/users", tags=["Archivos de Usuario"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Subir archivo a un usuario ────────────────────────────────────────────────

@router.post("/{user_id}/files", response_model=DataResponse)
async def upload_file(
    user_id: str,
    request: Request,
    file: UploadFile = File(...),
    company_slug: str = Form(...),
    description: Optional[str] = Form(None),
    payload=Depends(validator.get_current_user()),
    db=Depends(get_db),
):
    file_data = await file.read()
    roles = payload.get("roles", [])
    role = roles[0] if roles else "admin"

    result = await upload_user_file(
        db=db,
        user_id=user_id,
        file_data=file_data,
        filename=file.filename,
        content_type=file.content_type,
        company_slug=company_slug,
        description=description or "",
        token=request.headers.get("Authorization", "").replace("Bearer ", ""),
        performed_by=payload.get("user_id"),
        performed_by_name=payload.get("full_name", ""),
        performed_by_role=role,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent", ""),
    )
    return DataResponse(success=True, message="Archivo subido exitosamente", data=result)


# ── Listar archivos de un usuario ─────────────────────────────────────────────

@router.get("/{user_id}/files", response_model=DataResponse)
async def list_files(
    user_id: str,
    payload=Depends(validator.get_current_user()),
    db=Depends(get_db),
):
    files = await list_user_files(db=db, user_id=user_id)
    return DataResponse(success=True, message="Archivos obtenidos", data=files)


# ── Obtener URL firmada para descarga ─────────────────────────────────────────

@router.get("/{user_id}/files/{file_id}/download", response_model=DataResponse)
async def download_file(
    user_id: str,
    file_id: str,
    request: Request,
    payload=Depends(validator.get_current_user()),
    db=Depends(get_db),
):
    roles = payload.get("roles", [])
    role = roles[0] if roles else "admin"

    result = await get_download_url(
        db=db,
        file_id=file_id,
        token=request.headers.get("Authorization", "").replace("Bearer ", ""),
        performed_by=payload.get("user_id"),
        performed_by_name=payload.get("full_name", ""),
        performed_by_role=role,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent", ""),
    )
    return DataResponse(success=True, message="URL generada exitosamente", data=result)


# ── Eliminar archivo (soft delete) ────────────────────────────────────────────

@router.delete("/{user_id}/files/{file_id}", response_model=BaseResponse)
async def delete_file(
    user_id: str,
    file_id: str,
    request: Request,
    reason: Optional[str] = None,
    payload=Depends(validator.get_current_user()),
    db=Depends(get_db),
):
    roles = payload.get("roles", [])
    role = roles[0] if roles else "admin"

    await delete_user_file(
        db=db,
        file_id=file_id,
        reason=reason or "Sin motivo especificado",
        performed_by=payload.get("user_id"),
        performed_by_name=payload.get("full_name", ""),
        performed_by_role=role,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent", ""),
    )
    return BaseResponse(success=True, message="Archivo eliminado exitosamente")


# ── Listar auditoría de un archivo ────────────────────────────────────────────

@router.get("/{user_id}/files/{file_id}/audit", response_model=DataResponse)
async def file_audit(
    user_id: str,
    file_id: str,
    payload=Depends(validator.get_current_user()),
    db=Depends(get_db),
):
    logs = await list_file_audit(db=db, file_id=file_id)
    return DataResponse(success=True, message="Auditoría obtenida", data=logs)
