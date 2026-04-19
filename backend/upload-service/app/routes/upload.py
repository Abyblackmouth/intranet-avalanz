from fastapi import APIRouter, Depends, UploadFile, File, Form, Query
from typing import List, Optional

from app.config import config
from app.services.upload_service import upload, upload_multiple, remove, get_signed_url
from shared.models.responses import DataResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/upload", tags=["Almacenamiento"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Subir un archivo ──────────────────────────────────────────────────────────

@router.post("/", response_model=DataResponse, include_in_schema=True)
async def upload_file(
    file: UploadFile = File(...),
    company_slug: str = Form(...),
    module_slug: str = Form(...),
    submodule_slug: str = Form(...),
    payload=Depends(validator.get_current_user()),
):
    result = await upload(
        file=file,
        company_slug=company_slug,
        module_slug=module_slug,
        submodule_slug=submodule_slug,
        uploaded_by=payload.get("user_id"),
        company_id=payload.get("company_id") or "",
    )
    return DataResponse(success=True, message="Archivo subido exitosamente", data=result)


# ── Subir multiples archivos ──────────────────────────────────────────────────

@router.post("/multiple", response_model=DataResponse, include_in_schema=True)
async def upload_files(
    files: List[UploadFile] = File(...),
    company_slug: str = Form(...),
    module_slug: str = Form(...),
    submodule_slug: str = Form(...),
    payload=Depends(validator.get_current_user()),
):
    result = await upload_multiple(
        files=files,
        company_slug=company_slug,
        module_slug=module_slug,
        submodule_slug=submodule_slug,
        uploaded_by=payload.get("user_id"),
        company_id=payload.get("company_id") or "",
    )
    return DataResponse(success=True, message="Archivos procesados", data=result)


# ── Generar URL firmada para descarga ─────────────────────────────────────────

@router.get("/signed-url", response_model=DataResponse, include_in_schema=True)
async def signed_url(
    object_key: str = Query(...),
    bucket: str = Query(...),
    expiration_seconds: Optional[int] = Query(None),
    payload=Depends(validator.get_current_user()),
):
    result = await get_signed_url(
        object_key=object_key,
        bucket=bucket,
        expiration_seconds=expiration_seconds,
    )
    return DataResponse(success=True, message="URL generada exitosamente", data=result)


# ── Eliminar archivo ──────────────────────────────────────────────────────────

@router.delete("/", response_model=BaseResponse, include_in_schema=True)
async def delete_file(
    object_key: str = Query(...),
    bucket: str = Query(...),
    payload=Depends(validator.get_current_user()),
):
    await remove(object_key=object_key, bucket=bucket)
    return BaseResponse(success=True, message="Archivo eliminado exitosamente")
