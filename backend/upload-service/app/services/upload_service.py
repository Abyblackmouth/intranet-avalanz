import os
import uuid
from fastapi import UploadFile
from typing import Dict, Any, Optional

from app.config import config
from app.services.storage_service import (
    upload_file,
    delete_file,
    ensure_bucket,
    generate_signed_url,
    compute_checksum,
    build_object_key,
)
from shared.exceptions.http_exceptions import FileTooLargeException, InvalidFileTypeException
from shared.utils.helpers import now_utc


# ── Validacion de archivo ─────────────────────────────────────────────────────

async def validate_file(file: UploadFile) -> bytes:
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

    return file_data


# ── Subir archivo ─────────────────────────────────────────────────────────────

async def upload(
    file: UploadFile,
    company_slug: str,
    module_slug: str,
    submodule_slug: str,
    uploaded_by: str,
    company_id: str,
) -> Dict[str, Any]:

    file_data = await validate_file(file)

    ext = os.path.splitext(file.filename or "")[1].lower()
    filename = file.filename or "archivo"
    original_name = os.path.splitext(filename)[0]

    # Determinar bucket segun tipo de archivo
    is_image = file.content_type in config.ALLOWED_IMAGE_TYPES
    bucket = config.BUCKET_DIRDOC

    # Construir object key con estructura dirdoc/company_slug/module_slug/submodule_slug/
    unique_id = str(uuid.uuid4())[:8]
    safe_name = original_name.replace(" ", "_").lower()
    object_key = build_object_key(
        company_slug=company_slug,
        module_slug=module_slug,
        submodule_slug=submodule_slug,
        unique_id=unique_id,
        safe_name=safe_name,
        ext=ext,
    )

    # Calcular checksum SHA256 para verificacion de integridad
    checksum = compute_checksum(file_data)

    # Asegurar que el bucket dirdoc existe
    await ensure_bucket(bucket)

    # Subir a MinIO
    await upload_file(
        file_data=file_data,
        object_key=object_key,
        bucket=bucket,
        content_type=file.content_type,
        metadata={
            "uploaded_by": uploaded_by,
            "company_id": company_id,
            "company_slug": company_slug,
            "module_slug": module_slug,
            "submodule_slug": submodule_slug,
            "original_name": filename,
            "checksum": checksum,
        },
    )

    return {
        "object_key": object_key,
        "bucket": bucket,
        "original_name": filename,
        "stored_name": f"{unique_id}_{safe_name}{ext}",
        "content_type": file.content_type,
        "extension": ext,
        "size_bytes": len(file_data),
        "size_mb": round(len(file_data) / (1024 * 1024), 2),
        "checksum": checksum,
        "is_image": is_image,
        "uploaded_by": uploaded_by,
        "company_id": company_id,
        "company_slug": company_slug,
        "module_slug": module_slug,
        "submodule_slug": submodule_slug,
        "uploaded_at": now_utc().isoformat(),
    }


# ── Subir multiples archivos ──────────────────────────────────────────────────

async def upload_multiple(
    files: list[UploadFile],
    company_slug: str,
    module_slug: str,
    submodule_slug: str,
    uploaded_by: str,
    company_id: str,
) -> Dict[str, Any]:

    results = []
    errors = []

    for file in files:
        try:
            result = await upload(
                file=file,
                company_slug=company_slug,
                module_slug=module_slug,
                submodule_slug=submodule_slug,
                uploaded_by=uploaded_by,
                company_id=company_id,
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


# ── Generar URL firmada para descarga ─────────────────────────────────────────

async def get_signed_url(
    object_key: str,
    bucket: str,
    expiration_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    url = await generate_signed_url(
        object_key=object_key,
        bucket=bucket,
        expiration_seconds=expiration_seconds or config.SIGNED_URL_EXPIRATION,
    )
    return {
        "url": url,
        "object_key": object_key,
        "bucket": bucket,
        "expires_in_seconds": expiration_seconds or config.SIGNED_URL_EXPIRATION,
    }
