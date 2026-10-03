# ----------------------------------------------------------------------
# Documentos fuente para el usuario
#   POST /api/v1/assistant/documents/link        enlace firmado (15 min)
#   GET  /api/v1/assistant/documents/file/{firma} entrega por Nginx
# El enlace se pide con la sesion normal y la misma regla de acceso que
# la busqueda. El visor (iframe, video) no puede mandar el token, por eso
# usa un enlace firmado que solo sirve para ese archivo y vence pronto.
# PDF se ve; una transcripcion se cambia por su video (la transcripcion
# nunca se entrega); Word y PowerPoint se descargan. El archivo lo sirve
# Nginx (X-Accel-Redirect): Python solo autoriza.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import hashlib
import mimetypes
import time
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from app.api.search import _check_access, validator
from app.config import settings

router = APIRouter(tags=["documentos"])

LINK_SECONDS = 900
TRANSCRIPT_SUFFIX = ".transcripcion.docx"
VIDEO_EXTENSIONS = (".mp4", ".webm", ".m4v")
DOWNLOAD_EXTENSIONS = (".docx", ".pptx", ".xlsx")
INTERNAL_PREFIX = "/internal-fuentes/"

# Clave derivada: un enlace de documento nunca sirve como token de sesion
_KEY = hashlib.sha256(f"{settings.JWT_SECRET_KEY}:assistant-document-links".encode()).hexdigest()


class LinkRequest(BaseModel):
    document: str = Field(min_length=1, max_length=500)
    module: str = Field(min_length=1, max_length=100)


# ----------------------------------------------------------------------
# Ruta segura dentro de la carpeta de fuentes del modulo
# ----------------------------------------------------------------------
def _resolve(relative: str, module: str) -> Path:
    rel = PurePosixPath(relative)
    if rel.is_absolute() or ".." in rel.parts or not rel.parts or rel.parts[0] != module:
        raise HTTPException(status_code=404, detail="documento_no_encontrado")
    root = Path(settings.SOURCES_PATH).resolve()
    path = (root / rel).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="documento_no_encontrado")
    return path


@router.post("/documents/link")
async def document_link(body: LinkRequest, request: Request,
                        user: dict = Depends(validator.get_current_user())) -> dict:
    await _check_access(request, user, body.module)
    source = _resolve(body.document, body.module)
    if source.name.endswith(TRANSCRIPT_SUFFIX):
        base = source.name[: -len(TRANSCRIPT_SUFFIX)]
        target = next((source.with_name(base + ext) for ext in VIDEO_EXTENSIONS if source.with_name(base + ext).is_file()), None)
        if target is None:
            raise HTTPException(status_code=404, detail="video_no_disponible")
        mode = "video"
    elif source.suffix.lower() == ".pdf":
        target, mode = source, "pdf"
    elif source.suffix.lower() in DOWNLOAD_EXTENSIONS:
        target, mode = source, "download"
    else:
        raise HTTPException(status_code=404, detail="formato_no_disponible")
    relative = target.relative_to(Path(settings.SOURCES_PATH).resolve()).as_posix()
    token = jwt.encode({"type": "doc_link", "path": relative, "mode": mode, "sub": str(user.get("user_id", "")),
                        "exp": int(time.time()) + LINK_SECONDS}, _KEY, algorithm="HS256")
    return {"url": f"/api/v1/assistant/documents/file/{token}", "mode": mode, "filename": target.name}


@router.get("/documents/file/{token}")
async def document_file(token: str) -> Response:
    try:
        data = jwt.decode(token, _KEY, algorithms=["HS256"])
    except JWTError as error:
        raise HTTPException(status_code=403, detail="enlace_vencido_o_invalido") from error
    rel = PurePosixPath(str(data.get("path", "")))
    if data.get("type") != "doc_link" or rel.is_absolute() or ".." in rel.parts or rel.name.endswith(TRANSCRIPT_SUFFIX):
        raise HTTPException(status_code=403, detail="enlace_vencido_o_invalido")
    mime = mimetypes.guess_type(rel.name)[0] or "application/octet-stream"
    disposition = "attachment" if data.get("mode") == "download" else "inline"
    return Response(status_code=200, headers={
        "X-Accel-Redirect": INTERNAL_PREFIX + quote(rel.as_posix()),
        "Content-Type": mime,
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(rel.name)}",
        "Cache-Control": "private, max-age=900",
    })
