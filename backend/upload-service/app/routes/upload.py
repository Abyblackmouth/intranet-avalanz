from fastapi import APIRouter, Depends, UploadFile, File, Form
from typing import List, Optional

from app.config import config
from app.services.upload_service import upload, upload_multiple, remove
from shared.models.responses import DataResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/upload", tags=["Almacenamiento"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


@router.post("/", response_model=DataResponse)
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Form(...),
    module_slug: Optional[str] = Form(None),
    payload=Depends(validator.get_current_user()),
):
    result = await upload(
        file=file,
        folder=folder,
        uploaded_by=payload.get("user_id"),
        company_id=payload.get("company_id") or "",
        module_slug=module_slug,
    )
    return DataResponse(success=True, message="Archivo subido exitosamente", data=result)


@router.post("/multiple", response_model=DataResponse)
async def upload_files(
    files: List[UploadFile] = File(...),
    folder: str = Form(...),
    module_slug: Optional[str] = Form(None),
    payload=Depends(validator.get_current_user()),
):
    result = await upload_multiple(
        files=files,
        folder=folder,
        uploaded_by=payload.get("user_id"),
        company_id=payload.get("company_id") or "",
        module_slug=module_slug,
    )
    return DataResponse(success=True, message="Archivos procesados", data=result)


@router.delete("/", response_model=BaseResponse)
async def delete_file(
    object_key: str,
    bucket: str,
    payload=Depends(validator.get_current_user()),
):
    await remove(object_key=object_key, bucket=bucket)
    return BaseResponse(success=True, message="Archivo eliminado exitosamente")