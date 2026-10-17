"""Archivos del sobre → MinIO (boto3), con huella SHA-256.
Ruta: {bucket}/{conexion}/{origen_clave}/workflows/{process_id}/{folio o instancia}/."""
import base64
import hashlib
import mimetypes
import re
import uuid
from typing import Any, Dict, List

import boto3
from botocore.client import Config as BotoConfig
from fastapi import HTTPException

from app.config import config

MAX_MB = 25


def _cliente():
    if not config.MINIO_ENDPOINT:
        raise HTTPException(status_code=500, detail="Falta MINIO_ENDPOINT en el .env del workflows-service")
    endpoint = config.MINIO_ENDPOINT if config.MINIO_ENDPOINT.startswith("http") else f"{'https' if config.MINIO_SECURE else 'http'}://{config.MINIO_ENDPOINT}"
    return boto3.client("s3", endpoint_url=endpoint, aws_access_key_id=config.MINIO_ACCESS_KEY, aws_secret_access_key=config.MINIO_SECRET_KEY,
                        config=BotoConfig(signature_version="s3v4"), region_name="us-east-1")


def _limpio(nombre: str) -> str:
    nombre = re.sub(r"[^\w.\-]+", "_", (nombre or "archivo").strip())[:120]
    return nombre or "archivo"


def guardar_sobre(archivos: List[Dict[str, Any]], conexion_slug: str, origen_clave: str, process_id: str, carpeta: str) -> List[Dict[str, Any]]:
    """Sube los archivos base64 del sobre. Falla con 400 si alguno viene mal, ANTES de crear nada."""
    if not archivos:
        return []
    cliente = _cliente()
    salida = []
    for i, a in enumerate(archivos):
        nombre = _limpio(a.get("name") or f"archivo_{i + 1}")
        try:
            datos = base64.b64decode(a.get("base64") or "", validate=True)
        except Exception:
            raise HTTPException(status_code=400, detail=f"files[{i}].base64 no es base64 válido")
        if not datos:
            raise HTTPException(status_code=400, detail=f"files[{i}] viene vacío")
        if len(datos) > MAX_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"files[{i}] pesa más de {MAX_MB} MB")
        mime = a.get("contentType") or mimetypes.guess_type(nombre)[0] or "application/octet-stream"
        key = f"{conexion_slug}/{origen_clave.replace('|', '-')}/workflows/{process_id}/{carpeta}/{uuid.uuid4().hex[:8]}_{nombre}"
        cliente.put_object(Bucket=config.MINIO_BUCKET, Key=key, Body=datos, ContentType=mime)
        salida.append({"original_name": a.get("name") or nombre, "object_key": key, "bucket": config.MINIO_BUCKET, "mime_type": mime,
                       "size_bytes": len(datos), "sha256": hashlib.sha256(datos).hexdigest()})
    return salida


def url_firmada(object_key: str, bucket: str = None, segundos: int = 900) -> str:
    return _cliente().generate_presigned_url("get_object", Params={"Bucket": bucket or config.MINIO_BUCKET, "Key": object_key}, ExpiresIn=segundos)
