"""Registro de plugins de Toolkit TI.

Cada archivo de esta carpeta (que no empiece con _) es un plugin. Debe declarar:

  FICHA = {
      "nombre": "Nombre visible",
      "descripcion": "Que hace, en una o dos frases",
      "tipo": "manual",               # manual | programado | correo
      "grupo": "Excel y layouts",      # para agruparlo en la pantalla
      "parametros": [...],             # ver _plantilla.py
      "tiempo_maximo": 120,            # segundos
  }

  def ejecutar(params, archivos, salida, log): ...

El motor los descubre solos: agregar un plugin es agregar un archivo.
"""
import importlib
import pkgutil
from typing import Dict

TIPOS = {"manual", "programado", "correo"}
TIPOS_PARAM = {"archivo", "texto", "numero", "fecha", "mes", "opcion", "booleano"}


def _validar(slug: str, mod) -> dict:
    f = dict(getattr(mod, "FICHA", None) or {})
    if not f.get("nombre") or not callable(getattr(mod, "ejecutar", None)):
        raise ValueError(f"{slug}: falta FICHA['nombre'] o la funcion ejecutar")
    f.setdefault("descripcion", "")
    f.setdefault("tipo", "manual")
    f.setdefault("grupo", "General")
    f.setdefault("parametros", [])
    f.setdefault("tiempo_maximo", 120)
    if f["tipo"] not in TIPOS:
        raise ValueError(f"{slug}: tipo '{f['tipo']}' no valido")
    for p in f["parametros"]:
        if p.get("tipo") not in TIPOS_PARAM or not p.get("nombre"):
            raise ValueError(f"{slug}: parametro mal definido: {p}")
    f["slug"] = slug
    return f


def descubrir() -> Dict[str, dict]:
    """Fichas de todos los plugins validos, por slug. Los que tienen error se reportan aparte."""
    fichas, errores = {}, {}
    for info in pkgutil.iter_modules(__path__):
        if info.name.startswith("_"):
            continue
        try:
            mod = importlib.import_module(f"{__name__}.{info.name}")
            fichas[info.name] = _validar(info.name, mod)
        except Exception as e:  # un plugin roto no tumba a los demas
            errores[info.name] = str(e)[:300]
    descubrir.errores = errores
    return fichas


descubrir.errores = {}
