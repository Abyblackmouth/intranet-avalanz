"""Plantilla para un plugin nuevo de Toolkit TI.

1. Copia este archivo con un nombre corto en minusculas, sin el guion bajo
   inicial (por ejemplo: excel_layout_sat.py). Ese nombre es su slug.
2. Llena FICHA y escribe ejecutar().
3. Despliega el servicio: el plugin aparece solo en la pantalla.

Tipos de parametro:
  archivo   -> {"extensiones": [".xlsx", ".csv"]}  (llega como Path en `archivos`)
  texto     -> cadena
  numero    -> numero
  fecha     -> "AAAA-MM-DD"
  mes       -> "AAAA-MM"
  opcion    -> {"opciones": ["AGIM", "DIAGNOSIS"]}
  booleano  -> True / False
Cada parametro acepta tambien "requerido": True y "ayuda": "texto de apoyo".
"""
from pathlib import Path

FICHA = {
    "nombre": "Nombre visible del plugin",
    "descripcion": "Que hace, en una o dos frases.",
    "tipo": "manual",
    "grupo": "General",
    "parametros": [
        {"nombre": "archivo", "tipo": "archivo", "extensiones": [".xlsx"], "requerido": True},
    ],
    "tiempo_maximo": 120,
}


def ejecutar(params: dict, archivos: dict, salida: Path, log) -> None:
    """params: valores capturados; archivos: {nombre: Path}; salida: carpeta donde dejar
    los archivos resultantes (todo lo que quede ahi se puede descargar); log: imprime
    una linea en el registro que ve el usuario."""
    log("Iniciando…")
    # tu logica aqui; por ejemplo: (salida / "resultado.xlsx").write_bytes(...)
    log("Listo")
