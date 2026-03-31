import aioboto3
from botocore.exceptions import ClientError
from typing import Optional, BinaryIO
from app.config import config
from shared.exceptions.http_exceptions import StorageException


# ── Cliente S3 / MinIO ────────────────────────────────────────────────────────

def _get_session():
    return aioboto3.Session(
        aws_access_key_id=config.STORAGE_ACCESS_KEY,
        aws_secret_access_key=config.STORAGE_SECRET_KEY,
        region_name="us-east-1",
    )


def _get_endpoint() -> Optional[str]:
    # On-premise: apunta a MinIO
    # Nube: None (usa el endpoint nativo de S3)
    if config.STORAGE_ENDPOINT and "amazonaws" not in config.STORAGE_ENDPOINT:
        return config.STORAGE_ENDPOINT
    return None


# ── Operaciones de bucket ─────────────────────────────────────────────────────

async def ensure_bucket(bucket: str) -> None:
    session = _get_session()
    async with session.client(
        "s3",
        endpoint_url=_get_endpoint(),
        use_ssl=config.STORAGE_USE_SSL,
    ) as s3:
        try:
            await s3.head_bucket(Bucket=bucket)
        except ClientError:
            await s3.create_bucket(Bucket=bucket)


# ── Subir archivo ─────────────────────────────────────────────────────────────

async def upload_file(
    file_data: bytes,
    object_key: str,
    bucket: str,
    content_type: str,
    metadata: Optional[dict] = None,
) -> str:
    session = _get_session()
    async with session.client(
        "s3",
        endpoint_url=_get_endpoint(),
        use_ssl=config.STORAGE_USE_SSL,
    ) as s3:
        try:
            extra_args = {"ContentType": content_type}
            if metadata:
                extra_args["Metadata"] = {k: str(v) for k, v in metadata.items()}

            await s3.put_object(
                Bucket=bucket,
                Key=object_key,
                Body=file_data,
                **extra_args,
            )

            # Construir URL publica del archivo
            endpoint = config.STORAGE_ENDPOINT.rstrip("/")
            return f"{endpoint}/{bucket}/{object_key}"

        except ClientError as e:
            raise StorageException(f"Error al subir archivo: {str(e)}")


# ── Eliminar archivo ──────────────────────────────────────────────────────────

async def delete_file(object_key: str, bucket: str) -> None:
    session = _get_session()
    async with session.client(
        "s3",
        endpoint_url=_get_endpoint(),
        use_ssl=config.STORAGE_USE_SSL,
    ) as s3:
        try:
            await s3.delete_object(Bucket=bucket, Key=object_key)
        except ClientError as e:
            raise StorageException(f"Error al eliminar archivo: {str(e)}")


# ── Verificar existencia ──────────────────────────────────────────────────────

async def file_exists(object_key: str, bucket: str) -> bool:
    session = _get_session()
    async with session.client(
        "s3",
        endpoint_url=_get_endpoint(),
        use_ssl=config.STORAGE_USE_SSL,
    ) as s3:
        try:
            await s3.head_object(Bucket=bucket, Key=object_key)
            return True
        except ClientError:
            return False


# ── Obtener metadata del archivo ──────────────────────────────────────────────

async def get_file_metadata(object_key: str, bucket: str) -> dict:
    session = _get_session()
    async with session.client(
        "s3",
        endpoint_url=_get_endpoint(),
        use_ssl=config.STORAGE_USE_SSL,
    ) as s3:
        try:
            response = await s3.head_object(Bucket=bucket, Key=object_key)
            return {
                "content_type": response.get("ContentType"),
                "size": response.get("ContentLength"),
                "last_modified": response.get("LastModified"),
                "metadata": response.get("Metadata", {}),
            }
        except ClientError as e:
            raise StorageException(f"Error al obtener metadata: {str(e)}")