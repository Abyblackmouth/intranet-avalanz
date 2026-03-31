import os
import uuid
from fastapi import UploadFile
from typing import Dict, Any, Optional

from app.config import config
from app.services.storage_service import upload_file, delete_file, ensure_bucket
from shared.exceptions.http_exceptions import FileTooLargeException, InvalidFileTypeException
from shared.utils.helpers import now_utc


# ── Validacion de archivo ─────────────────────────────────────────────────────

async def validate_file(file: UploadFile) -> None:
    # Validar tipo MIME
    if file.content_type not in config.ALLOWED_MIME_TYPES:
        raise InvalidFileTypeException(
            f"Tipo de archivo no permitido: {file.content_type}. "
            f"Tipos permitidos: {', '.join(config.ALLOWED_MIME_TYPES)}"
        )

    # Validar extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in config.ALLOWED_EXTENSIONS:
        raise InvalidFileTypeException(
            f"Extension no permitida: {ext}. "
            f"Extensiones permitidas: {', '.join(config.ALLOWED_EXTENSIONS)}"
        )

    # Leer y validar tamaño
    file_data = await file.read()
    if len(file_data) > config.MAX_FILE_SIZE_BYTES:
        raise FileTooLargeException(max_size_mb=config.MAX_FILE_SIZE_MB)

    # Regresar puntero al inicio para que se pueda leer de nuevo
    await file.seek(0)


# ── Subir archivo ─────────────────────────────────────────────────────────────

async def upload(
    file: UploadFile,
    folder: str,
    uploaded_by: str,
    company_id: str,
    module_slug: Optional[str] = None,
) -> Dict[str, Any]:

    await validate_file(file)

    file_data = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower()
    filename = file.filename or "archivo"
    original_name = os.path.splitext(filename)[0]

    # Determinar bucket segun tipo
    is_image = file.content_type in config.ALLOWED_IMAGE_TYPES
    bucket = config.BUCKET_IMAGES if is_image else config.BUCKET_DOCUMENTS

    # Construir object key con estructura de carpetas
    # Formato: company_id/module_slug/folder/uuid_originalname.ext
    unique_id = str(uuid.uuid4())[:8]
    safe_name = original_name.replace(" ", "_").lower()
    object_key = _build_object_key(company_id, module_slug, folder, unique_id, safe_name, ext)

    # Asegurar que el bucket existe
    await ensure_bucket(bucket)

    # Subir a MinIO / S3
    url = await upload_file(
        file_data=file_data,
        object_key=object_key,
        bucket=bucket,
        content_type=file.content_type,
        metadata={
            "uploaded_by": uploaded_by,
            "company_id": company_id,
            "module": module_slug or "",
            "original_name": filename,
        },
    )

    return {
        "url": url,
        "object_key": object_key,
        "bucket": bucket,
        "original_name": filename,
        "content_type": file.content_type,
        "size_bytes": len(file_data),
        "size_mb": round(len(file_data) / (1024 * 1024), 2),
        "is_image": is_image,
        "uploaded_by": uploaded_by,
        "company_id": company_id,
        "module_slug": module_slug,
        "uploaded_at": now_utc().isoformat(),
    }


# ── Subir multiples archivos ──────────────────────────────────────────────────

async def upload_multiple(
    files: list[UploadFile],
    folder: str,
    uploaded_by: str,
    company_id: str,
    module_slug: Optional[str] = None,
) -> Dict[str, Any]:

    results = []
    errors = []

    for file in files:
        try:
            result = await upload(
                file=file,
                folder=folder,
                uploaded_by=uploaded_by,
                company_id=company_id,
                module_slug=module_slug,
            )
            results.append(result)
        except Exception as e:
            errors.append({
                "filename": file.filename,
                "error": str(e),
            })

    return {
        "uploaded": results,
        "errors": errors,
        "total_uploaded": len(results),
        "total_errors": len(errors),
    }


# ── Eliminar archivo ──────────────────────────────────────────────────────────

async def remove(object_key: str, bucket: str) -> None:
    await delete_file(object_key=object_key, bucket=bucket)


# ── Helpers internos ──────────────────────────────────────────────────────────

def _build_object_key(
    company_id: str,
    module_slug: Optional[str],
    folder: str,
    unique_id: str,
    safe_name: str,
    ext: str,
) -> str:
    parts = [company_id]
    if module_slug:
        parts.append(module_slug)
    parts.append(folder)
    parts.append(f"{unique_id}_{safe_name}{ext}")
    return "/".join(parts)