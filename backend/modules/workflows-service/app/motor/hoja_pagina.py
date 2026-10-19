"""Pagina de aprobacion de Workflows (diseno v9), hecha de cero y renderizada en el servidor.

Es la que abre la liga del correo: documento HTML completo y autonomo (no depende del
frontend de la Intranet), con la hoja del tramite segun la plantilla del flujo y la barra
Aprobar / Rechazar, que llama a POST /public/aprobar/{token}/decidir."""
import pathlib
from typing import Any, Dict, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

_ENV = Environment(loader=FileSystemLoader(str(pathlib.Path(__file__).parent / "plantillas")), autoescape=select_autoescape(["html"]))

_DOC = {"pdf": "pdf", "xls": "xls", "csv": "xls", "doc": "word", "jpg": "img", "png": "img", "gif": "img", "webp": "img", "xml": "xml"}


def html(hoja: Dict[str, Any], *, puede_decidir: bool = False, url_decidir: str = "", decide_como: str = "", etapa_orden: Optional[int] = None,
         etapa_nombre: str = "", mensaje: str = "", mensaje_tono: str = "") -> str:
    return _ENV.get_template("hoja_pagina.html").render(
        h=hoja, puede_decidir=puede_decidir, url_decidir=url_decidir, decide_como=decide_como, etapa_orden=etapa_orden,
        etapa_nombre=etapa_nombre, mensaje=mensaje, mensaje_tono=mensaje_tono, clase_doc=lambda e: _DOC.get(e, ""))
