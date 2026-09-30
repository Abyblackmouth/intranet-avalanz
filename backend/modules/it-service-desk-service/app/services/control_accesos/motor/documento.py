"""Motor de documentos del Control de accesos: arma el contexto y convierte el
template HTML de cada formato. La vista previa y el PDF salen del mismo template."""
import base64
from functools import lru_cache
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

FORMATOS_DIR = Path(__file__).resolve().parent.parent / "formatos"
FUENTES_WEB = ("@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700"
               "&family=Geist+Mono:wght@500&display=swap');")
MAX_COLUMNAS = 6
LOGO = Path(__file__).resolve().parents[3] / "static" / "logo_avalanz.png"


@lru_cache(maxsize=1)
def _logo_src() -> str:
    """El logo como data URI: funciona igual en la vista previa y en el PDF, sin rutas externas."""
    try:
        from app.services.logo import logo_recortado_bytes
        return "data:image/png;base64," + base64.b64encode(logo_recortado_bytes()).decode()
    except OSError:
        return ""


def columnas_de_familias(familias: list[dict], juntas: set | None = None, max_columnas: int = MAX_COLUMNAS) -> list[list[dict]]:
    """Una columna por familia, en el orden recibido. Una familia en "juntas" comparte
    columna con la siguiente (DYCE y SPPEL). Solo si quedaran mas de max_columnas se
    juntan, como respaldo, las mas chicas vecinas."""
    juntas = juntas or set()
    columnas: list[list[dict]] = []
    i = 0
    while i < len(familias):
        if familias[i].get("id") in juntas and i + 1 < len(familias):
            columnas.append([familias[i], familias[i + 1]])
            i += 2
        else:
            columnas.append([familias[i]])
            i += 1
    while len(columnas) > max_columnas:
        solas = [k for k, c in enumerate(columnas) if len(c) == 1]
        pares = [(k, j) for k, j in zip(solas, solas[1:]) if j == k + 1]
        if not pares:
            break
        k, j = min(pares, key=lambda p: sum(len(f["empresas"]) for f in columnas[p[0]] + columnas[p[1]]))
        columnas[k] = columnas[k] + columnas[j]
        del columnas[j]
    return columnas


def renderizar(clave_formato: str, contexto: dict, fuentes: str = FUENTES_WEB) -> str:
    carpeta = FORMATOS_DIR / clave_formato
    if not (carpeta / "template.html").exists():
        raise FileNotFoundError(f"El formato {clave_formato} no tiene template.html")
    env = Environment(loader=FileSystemLoader(str(carpeta)), autoescape=select_autoescape(["html"]),
                      trim_blocks=True, lstrip_blocks=True)
    return env.get_template("template.html").render(fuentes=fuentes, logo_src=_logo_src(), **contexto)


def contexto_vista_previa(config: dict, fecha: str, metodo_firma: str = "manual", prueba: bool = False) -> dict:
    """Contexto con la configuracion real del formato y datos de ejemplo del usuario.
    config: la respuesta de detalle_formato (formato, empresas_elegidas, catalogo_empresas, modulos)."""
    catalogo = {c["id"]: c for c in config["catalogo_empresas"]}
    familias: dict[str, dict] = {}
    for cid in config["empresas_elegidas"]:
        c = catalogo.get(cid)
        if not c:
            continue
        fam = c.get("familia") or {}
        fid = fam.get("id") or "__sin__"
        familias.setdefault(fid, {"id": fid, "nombre": fam.get("nombre") or "SIN FAMILIA", "empresas": []})["empresas"].append(
            {"nombre": c["nombre_comercial"], "marcada": False})
    presentacion = config["formato"].get("presentacion") or {}
    orden = presentacion.get("orden") or []
    posicion = lambda f: (orden.index(f["id"]) if f["id"] in orden else 10_000 + (f["id"] == "__sin__") * 10_000, f["nombre"])
    familias_ordenadas = sorted(familias.values(), key=posicion)
    activos = [m for m in config["modulos"] if m["activo"]]
    fila = lambda m: {"nombre": m["nombre"], "marcado": False, "perfil": "", "rutinas": ""}
    return {
        "folio": "ACC-XXXX-000000", "fecha": fecha,
        "sistema_titulo": config["formato"]["nombre"], "movimiento_titulo": "Alta",
        "prueba": prueba,
        "metodo_firma_texto": "DocuSign" if metodo_firma == "docusign" else "manual (imprimir, firmar y subir escaneado)",
        "usuario": {"nombre": "NOMBRE DEL SOLICITANTE", "matricula": "000000", "puesto": "PUESTO", "departamento": "DEPARTAMENTO",
                    "empresa": "EMPRESA", "grupo": "FAMILIA", "jefe_nombre": "NOMBRE DEL JEFE DIRECTO", "correo": "correo@avalanz.com",
                    "nombre_firma": "", "jefe_nombre_firma": ""},
        "tipo": {"alta_nueva": False, "reemplazo": False, "migracion": False, "auditoria": False, "usuario_modelo": "", "reemplaza_a": ""},
        "columnas": columnas_de_familias(familias_ordenadas, set(presentacion.get("juntas") or [])),
        "modulos": [fila(m) for m in activos if not m["exclusivo_admin"]],
        "modulos_admin": [fila(m) for m in activos if m["exclusivo_admin"]],
        "vigencia": {"permanente": False, "temporal": False, "hasta": "", "observaciones": ""},
        "ti": {"usuario_asignado": "", "fecha_alta": "", "admin_nombre": config["formato"].get("admin_nombre") or ""},
    }
