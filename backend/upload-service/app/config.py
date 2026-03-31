from functools import lru_cache
from typing import List
from shared.config.base_config import BaseConfig


class UploadConfig(BaseConfig):

    # ── Identificacion del servicio ───────────────────────────────────────────
    SERVICE_NAME: str = "upload-service"
    SERVICE_VERSION: str = "1.0.0"

    # ── Limites de archivos ───────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 50
    MAX_FILE_SIZE_BYTES: int = 50 * 1024 * 1024

    # ── Tipos de archivo permitidos ───────────────────────────────────────────
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    ALLOWED_DOCUMENT_TYPES: List[str] = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]

    @property
    def ALLOWED_MIME_TYPES(self) -> List[str]:
        return self.ALLOWED_IMAGE_TYPES + self.ALLOWED_DOCUMENT_TYPES

    # ── Extensiones permitidas ────────────────────────────────────────────────
    ALLOWED_EXTENSIONS: List[str] = [
        ".jpg", ".jpeg", ".png", ".gif", ".webp",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ]

    # ── Buckets por categoria ─────────────────────────────────────────────────
    BUCKET_IMAGES: str = "avalanz-images"
    BUCKET_DOCUMENTS: str = "avalanz-documents"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_config() -> UploadConfig:
    return UploadConfig()


config = get_config()