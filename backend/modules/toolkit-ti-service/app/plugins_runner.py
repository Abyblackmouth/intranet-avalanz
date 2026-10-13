"""Corre UN plugin en un proceso aparte (lo lanza el servicio con limite de tiempo y memoria).

Uso: python -m app.plugins_runner <slug> <carpeta_de_trabajo>
La carpeta trae params.json, archivos.json y entrada/; los resultados quedan en salida/.
"""
import importlib
import json
import sys
import traceback
from pathlib import Path


def main() -> int:
    slug, trabajo = sys.argv[1], Path(sys.argv[2])
    salida = trabajo / "salida"
    salida.mkdir(exist_ok=True)
    params = json.loads((trabajo / "params.json").read_text())
    archivos = {k: trabajo / "entrada" / v for k, v in json.loads((trabajo / "archivos.json").read_text()).items()}

    def log(texto: str) -> None:
        print(f"› {texto}", flush=True)

    try:
        mod = importlib.import_module(f"app.plugins.{slug}")
        mod.ejecutar(params, archivos, salida, log)
        return 0
    except Exception as e:
        print(f"✗ {type(e).__name__}: {e}", flush=True)
        print(traceback.format_exc(limit=4), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
