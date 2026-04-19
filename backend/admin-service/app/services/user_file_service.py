import uuid
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_models import UserFile, UserFileAuditLog, User
from shared.exceptions.http_exceptions import NotFoundException
from shared.utils.helpers import now_utc

UPLOAD_SERVICE_URL = "http://upload-service:8000/api/v1/upload"


# ── Subir archivo de usuario ──────────────────────────────────────────────────

async def upload_user_file(
    db: AsyncSession,
    user_id: str,
    file_data: bytes,
    filename: str,
    content_type: str,
    company_slug: str,
    description: str,
    token: str,
    performed_by: str,
    performed_by_name: str,
    performed_by_role: str,
    ip_address: str,
    user_agent: str,
) -> dict:
    # Verificar que el usuario existe
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")

    # Construir nombre descriptivo del archivo
    matricula = getattr(user, "matricula", None) or str(user.id)[:8]
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "pdf"
    company = company_slug.lower().replace(" ", "-")
    folio = str(uuid.uuid4())[:8]
    custom_filename = f"user_{matricula}_{company}_{folio}.{ext}"

    # Subir archivo al upload-service
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{UPLOAD_SERVICE_URL}/",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": (custom_filename, file_data, content_type)},
            data={
                "company_slug": "admin",
                "module_slug": "employees",
                "submodule_slug": "documents",
            },
        )
        if response.status_code != 200:
            raise Exception(f"Error al subir archivo: {response.text}")
        upload_data = response.json()["data"]

    # Guardar registro en BD
    user_file = UserFile(
        user_id=user_id,
        company_id=str(user.company_id),
        original_name=upload_data["original_name"],
        stored_name=upload_data["stored_name"],
        object_key=upload_data["object_key"],
        bucket=upload_data["bucket"],
        mime_type=upload_data["content_type"],
        extension=upload_data["extension"],
        size_bytes=upload_data["size_bytes"],
        checksum=upload_data["checksum"],
        description=description,
        uploaded_by=performed_by,
        uploaded_at=now_utc(),
    )
    db.add(user_file)
    await db.flush()

    # Registrar auditoría
    await _log_audit(
        db=db,
        file_id=str(user_file.id),
        action="uploaded",
        performed_by=performed_by,
        performed_by_name=performed_by_name,
        performed_by_role=performed_by_role,
        ip_address=ip_address,
        user_agent=user_agent,
        company_id=str(user.company_id),
        detail={
            "size_bytes": upload_data["size_bytes"],
            "mime_type": upload_data["content_type"],
            "original_name": upload_data["original_name"],
        },
    )

    await db.commit()
    await db.refresh(user_file)
    return _serialize_file(user_file)


# ── Listar archivos de un usuario ─────────────────────────────────────────────

async def list_user_files(db: AsyncSession, user_id: str) -> list:
    result = await db.execute(
        select(UserFile).where(
            UserFile.user_id == user_id,
            UserFile.is_deleted == False,
        ).order_by(UserFile.uploaded_at.desc())
    )
    files = result.scalars().all()
    return [_serialize_file(f) for f in files]


# ── Obtener URL firmada para descarga ─────────────────────────────────────────

async def get_download_url(
    db: AsyncSession,
    file_id: str,
    token: str,
    performed_by: str,
    performed_by_name: str,
    performed_by_role: str,
    ip_address: str,
    user_agent: str,
) -> dict:
    result = await db.execute(
        select(UserFile).where(UserFile.id == file_id, UserFile.is_deleted == False)
    )
    user_file = result.scalar_one_or_none()
    if not user_file:
        raise NotFoundException("Archivo")

    # Obtener URL firmada del upload-service
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{UPLOAD_SERVICE_URL}/signed-url",
            headers={"Authorization": f"Bearer {token}"},
            params={"object_key": user_file.object_key, "bucket": user_file.bucket},
        )
        if response.status_code != 200:
            raise Exception(f"Error al generar URL: {response.text}")
        url_data = response.json()["data"]

    # Registrar auditoría de descarga
    await _log_audit(
        db=db,
        file_id=file_id,
        action="downloaded",
        performed_by=performed_by,
        performed_by_name=performed_by_name,
        performed_by_role=performed_by_role,
        ip_address=ip_address,
        user_agent=user_agent,
        company_id=str(user_file.company_id),
        detail={"url_type": "signed_url", "expires_in": url_data["expires_in_seconds"]},
    )

    await db.commit()
    return url_data


# ── Eliminar archivo (soft delete) ────────────────────────────────────────────

async def delete_user_file(
    db: AsyncSession,
    file_id: str,
    reason: str,
    performed_by: str,
    performed_by_name: str,
    performed_by_role: str,
    ip_address: str,
    user_agent: str,
) -> dict:
    result = await db.execute(
        select(UserFile).where(UserFile.id == file_id, UserFile.is_deleted == False)
    )
    user_file = result.scalar_one_or_none()
    if not user_file:
        raise NotFoundException("Archivo")

    # Soft delete
    user_file.is_deleted = True
    user_file.deleted_at = now_utc()
    user_file.deleted_by = performed_by
    user_file.deleted_reason = reason

    # Registrar auditoría
    await _log_audit(
        db=db,
        file_id=file_id,
        action="deleted",
        performed_by=performed_by,
        performed_by_name=performed_by_name,
        performed_by_role=performed_by_role,
        ip_address=ip_address,
        user_agent=user_agent,
        company_id=str(user_file.company_id),
        detail={"reason": reason, "object_key": user_file.object_key},
    )

    await db.commit()
    return {"success": True, "message": "Archivo eliminado"}


# ── Listar auditoría de un archivo ────────────────────────────────────────────

async def list_file_audit(db: AsyncSession, file_id: str) -> list:
    result = await db.execute(
        select(UserFileAuditLog).where(
            UserFileAuditLog.file_id == file_id,
        ).order_by(UserFileAuditLog.performed_at.desc())
    )
    logs = result.scalars().all()
    return [_serialize_audit(log) for log in logs]


# ── Helpers internos ──────────────────────────────────────────────────────────

async def _log_audit(
    db: AsyncSession,
    file_id: str,
    action: str,
    performed_by: str,
    performed_by_name: str,
    performed_by_role: str,
    ip_address: str,
    user_agent: str,
    company_id: str,
    detail: dict,
) -> None:
    log = UserFileAuditLog(
        file_id=file_id,
        action=action,
        performed_by=performed_by,
        performed_by_name=performed_by_name,
        performed_by_role=performed_by_role,
        performed_at=now_utc(),
        ip_address=ip_address,
        user_agent=user_agent,
        company_id=company_id,
        module_slug="admin",
        detail=detail,
    )
    db.add(log)


def _serialize_file(f: UserFile) -> dict:
    return {
        "id": str(f.id),
        "user_id": str(f.user_id),
        "company_id": str(f.company_id),
        "original_name": f.original_name,
        "stored_name": f.stored_name,
        "object_key": f.object_key,
        "bucket": f.bucket,
        "mime_type": f.mime_type,
        "extension": f.extension,
        "size_bytes": f.size_bytes,
        "size_mb": round(f.size_bytes / (1024 * 1024), 2),
        "checksum": f.checksum,
        "description": f.description,
        "is_deleted": f.is_deleted,
        "deleted_at": f.deleted_at.isoformat() if f.deleted_at else None,
        "deleted_by": str(f.deleted_by) if f.deleted_by else None,
        "deleted_reason": f.deleted_reason,
        "uploaded_by": str(f.uploaded_by),
        "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
        "last_modified_by": str(f.last_modified_by) if f.last_modified_by else None,
        "last_modified_at": f.last_modified_at.isoformat() if f.last_modified_at else None,
    }


def _serialize_audit(log: UserFileAuditLog) -> dict:
    return {
        "id": str(log.id),
        "file_id": str(log.file_id),
        "action": log.action,
        "performed_by": str(log.performed_by),
        "performed_by_name": log.performed_by_name,
        "performed_by_role": log.performed_by_role,
        "performed_at": log.performed_at.isoformat() if log.performed_at else None,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "company_id": str(log.company_id),
        "module_slug": log.module_slug,
        "detail": log.detail,
    }