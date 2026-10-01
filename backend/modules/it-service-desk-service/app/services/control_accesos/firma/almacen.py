"""Lectura y escritura en MinIO para el Control de accesos (mismas credenciales que Legal)."""
import os

BUCKET = "dirdoc"


def _cliente():
    import boto3
    from botocore.config import Config
    ep = os.getenv("MINIO_ENDPOINT", "")
    return boto3.client("s3", endpoint_url=ep if ep.startswith("http") else f"http://{ep}",
                        aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"), aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
                        config=Config(signature_version="s3v4"), region_name="us-east-1")


def guardar(datos: bytes, key: str, tipo: str = "application/pdf") -> None:
    _cliente().put_object(Bucket=BUCKET, Key=key, Body=datos, ContentType=tipo)


def leer(key: str) -> bytes:
    return _cliente().get_object(Bucket=BUCKET, Key=key)["Body"].read()
