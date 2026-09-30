"""Motor de documentos del Control de accesos: arma el contexto y convierte el
template HTML de cada formato. La vista previa y el PDF salen del mismo template."""
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

FORMATOS_DIR = Path(__file__).resolve().parent.parent / "formatos"
FUENTES_WEB = ("@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700"
               "&family=Geist+Mono:wght@500&display=swap');")
MAX_COLUMNAS = 6


def columnas_de_familias(familias: list[dict], max_columnas: int = MAX_COLUMNAS) -> list[list[dict]]:
    """Acomoda las familias en columnas. Las chicas (1-2 empresas) comparten columna
    de dos en dos, como DYCE y SPPEL en el formato aprobado; si aun sobran columnas,
    se juntan las mas chicas vecinas."""
    columnas: list[list[dict]] = []
    pendiente = None
    for fam in familias:
        if len(fam["empresas"]) <= 2:
            if pendiente is None:
                pendiente = [fam]
                columnas.append(pendiente)
            else:
                pendiente.append(fam)
                pendiente = None
        else:
            columnas.append([fam])
    while len(columnas) > max_columnas:
        solas = [i for i, c in enumerate(columnas) if len(c) == 1]
        pares = [(i, j) for i, j in zip(solas, solas[1:]) if j == i + 1]
        if not pares:
            break
        i, j = min(pares, key=lambda p: sum(len(f["empresas"]) for f in columnas[p[0]] + columnas[p[1]]))
        columnas[i] = columnas[i] + columnas[j]
        del columnas[j]
    return columnas


def renderizar(clave_formato: str, contexto: dict, fuentes: str = FUENTES_WEB) -> str:
    carpeta = FORMATOS_DIR / clave_formato
    if not (carpeta / "template.html").exists():
        raise FileNotFoundError(f"El formato {clave_formato} no tiene template.html")
    env = Environment(loader=FileSystemLoader(str(carpeta)), autoescape=select_autoescape(["html"]),
                      trim_blocks=True, lstrip_blocks=True)
    return env.get_template("template.html").render(fuentes=fuentes, **contexto)


def contexto_vista_previa(config: dict, fecha: str, metodo_firma: str = "manual", prueba: bool = False) -> dict:
    """Contexto con la configuracion real del formato y datos de ejemplo del usuario.
    config: la respuesta de detalle_formato (formato, empresas_elegidas, catalogo_empresas, modulos)."""
    catalogo = {c["id"]: c for c in config["catalogo_empresas"]}
    familias: dict[str, dict] = {}
    for cid in config["empresas_elegidas"]:
        c = catalogo.get(cid)
        if not c:
            continue
        nombre = (c.get("familia") or {}).get("nombre") or "SIN FAMILIA"
        familias.setdefault(nombre, {"nombre": nombre, "empresas": []})["empresas"].append({"nombre": c["nombre_comercial"], "marcada": False})
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
        "columnas": columnas_de_familias(list(familias.values())),
        "modulos": [fila(m) for m in activos if not m["exclusivo_admin"]],
        "modulos_admin": [fila(m) for m in activos if m["exclusivo_admin"]],
        "vigencia": {"permanente": False, "temporal": False, "hasta": "", "observaciones": ""},
        "ti": {"usuario_asignado": "", "fecha_alta": "", "admin_nombre": config["formato"].get("admin_nombre") or ""},
    }
