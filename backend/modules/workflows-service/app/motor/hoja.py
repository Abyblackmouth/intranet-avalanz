"""Motor · hoja del tramite (plantilla por flujo).

Cada flujo guarda en flujos.hoja como se presenta su documento:

{
  "documento": {"etiqueta": "Solicitud de compra", "numero": "numerosolicitud", "area": "Compras"},
  "tarjetas":  [{"clave": "proveedor", "etiqueta": "Proveedor", "tipo": "texto"}, ...],
  "adjuntos":  true,
  "tablas": [{
      "clave": "items", "titulo": "Partidas",
      "columnas": [{"clave": "cantidad", "etiqueta": "Cantidad", "tipo": "numero", "alinear": "der"}, ...],
      "totales":  [{"clave": "subtotal", "etiqueta": "Subtotal", "tipo": "moneda"},
                   {"clave": "total", "etiqueta": "Total", "tipo": "moneda", "destacado": true}]
  }]
}

armar() convierte tramite + configuracion en una estructura ya formateada (textos listos para
mostrar) que consumen por igual la pantalla (React) y el correo (Jinja2). Sin configuracion,
se infiere una hoja razonable a partir de cardData: nada depende de que alguien la configure.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

TIPOS = ("texto", "moneda", "numero", "fecha", "porcentaje")
ALINEAR = ("izq", "centro", "der")
MAX_TARJETAS = 16
MAX_TABLAS = 6
MAX_COLUMNAS = 14
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

# claves de cardData que no son datos de negocio (no se infieren como tarjetas)
_TECNICAS = {"operacion", "usuarioTotvs", "baseUrl"}


# ── Utilidades ────────────────────────────────────────────────────────────

def _valor(d: Dict[str, Any], ruta: str) -> Any:
    actual: Any = d
    for parte in (ruta or "").split("."):
        if not isinstance(actual, dict) or parte not in actual:
            return None
        actual = actual[parte]
    return actual


def _clave_ok(c: str) -> bool:
    return bool(c) and c.replace("_", "").replace(".", "").isalnum() and len(c) <= 80


def _etiqueta_de(clave: str) -> str:
    """camelCase / snake_case -> 'Etiqueta legible'."""
    out = ""
    for i, ch in enumerate(clave.split(".")[-1].replace("_", " ")):
        if ch.isupper() and i and out and out[-1] != " ":
            out += " "
        out += ch
    out = out.strip()
    return (out[:1].upper() + out[1:].lower()) if out else clave


def formatear(valor: Any, tipo: str = "texto") -> str:
    if valor is None or valor == "":
        return ""
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    if tipo in ("moneda", "numero", "porcentaje"):
        try:
            n = float(str(valor).replace(",", "").replace("$", ""))
        except ValueError:
            return str(valor)
        if tipo == "moneda":
            return f"${n:,.2f}"
        if tipo == "porcentaje":
            return f"{n:g} %"
        return f"{int(n):,}" if n.is_integer() else f"{n:,.2f}"
    if tipo == "fecha":
        s = str(valor).strip()
        for fmt, largo in (("%Y%m%d", 8), ("%Y-%m-%d", 10), ("%d/%m/%Y", 10), ("%Y-%m-%dT%H:%M:%S", 19)):
            try:
                d = datetime.strptime(s[:largo], fmt)
                return f"{d.day} {MESES[d.month - 1]} {d.year}"
            except ValueError:
                continue
        return s
    return str(valor).strip()


def _es_numero(v: Any) -> bool:
    if isinstance(v, bool):
        return False
    if isinstance(v, (int, float)):
        return True
    try:
        float(str(v).replace(",", ""))
        return True
    except ValueError:
        return False


# ── Configuracion ─────────────────────────────────────────────────────────

def normalizar(cfg: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Valida y limpia lo que llega del editor. Lanza ValueError con mensaje en espanol."""
    cfg = cfg or {}
    doc = cfg.get("documento") or {}
    numero = str(doc.get("numero") or "folio").strip()
    if not _clave_ok(numero):
        raise ValueError("El campo del número de documento solo lleva letras, números, punto y guion bajo")
    documento = {"etiqueta": str(doc.get("etiqueta") or "").strip()[:60], "numero": numero, "area": str(doc.get("area") or "").strip()[:40]}

    def campo(c: Dict[str, Any], donde: str) -> Optional[Dict[str, Any]]:
        clave = str(c.get("clave") or "").strip()
        if not clave:
            return None
        if not _clave_ok(clave):
            raise ValueError(f"{donde}: la clave «{clave}» solo lleva letras, números, punto y guion bajo")
        tipo = str(c.get("tipo") or "texto")
        if tipo not in TIPOS:
            raise ValueError(f"{donde}: tipo «{tipo}» no válido ({', '.join(TIPOS)})")
        out = {"clave": clave, "etiqueta": str(c.get("etiqueta") or _etiqueta_de(clave)).strip()[:40], "tipo": tipo}
        return out

    tarjetas = [x for x in (campo(c, "Tarjetas") for c in (cfg.get("tarjetas") or [])) if x]
    if len(tarjetas) > MAX_TARJETAS:
        raise ValueError(f"Máximo {MAX_TARJETAS} tarjetas")

    tablas = []
    for t in (cfg.get("tablas") or []):
        clave = str(t.get("clave") or "").strip()
        if not clave:
            continue
        if not _clave_ok(clave):
            raise ValueError(f"Tablas: la clave «{clave}» solo lleva letras, números, punto y guion bajo")
        cols = []
        for c in (t.get("columnas") or []):
            x = campo(c, f"Tabla {clave}")
            if x:
                al = str(c.get("alinear") or ("der" if x["tipo"] in ("moneda", "numero", "porcentaje") else "izq"))
                x["alinear"] = al if al in ALINEAR else "izq"
                x["detalle"] = str(c.get("detalle") or "").strip() if _clave_ok(str(c.get("detalle") or "")) else ""
                cols.append(x)
        if len(cols) > MAX_COLUMNAS:
            raise ValueError(f"Tabla {clave}: máximo {MAX_COLUMNAS} columnas")
        tots = []
        for c in (t.get("totales") or []):
            x = campo(c, f"Totales de {clave}")
            if x:
                x["destacado"] = bool(c.get("destacado"))
                tots.append(x)
        tablas.append({"clave": clave, "titulo": str(t.get("titulo") or _etiqueta_de(clave)).strip()[:40], "columnas": cols, "totales": tots})
    if len(tablas) > MAX_TABLAS:
        raise ValueError(f"Máximo {MAX_TABLAS} tablas")

    return {"documento": documento, "tarjetas": tarjetas, "adjuntos": bool(cfg.get("adjuntos", True)), "tablas": tablas}


def inferir(card_data: Dict[str, Any], resumen_cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Hoja por defecto a partir de cardData (y del resumen del flujo, si existe). Tambien la usa
    el boton «Detectar campos» del editor como punto de partida."""
    cd = card_data or {}
    numero = (resumen_cfg or {}).get("numero") or ("numerosolicitud" if cd.get("numerosolicitud") else "folio")
    tarjetas, tablas = [], []
    listas = [k for k, v in cd.items() if isinstance(v, list) and v and all(isinstance(x, dict) for x in v)]
    totales_claves = [k for k in ("subtotal", "impuesto", "iva", "descuento", "total") if k in cd and _es_numero(cd[k])]
    for k, v in cd.items():
        if k in listas or k in totales_claves or k == numero or k in _TECNICAS or isinstance(v, (dict, list)):
            continue
        tipo = "fecha" if "fecha" in k.lower() else ("moneda" if any(p in k.lower() for p in ("importe", "monto", "valor", "precio", "costo")) and _es_numero(v) else "texto")
        tarjetas.append({"clave": k, "etiqueta": _etiqueta_de(k), "tipo": tipo})
    for k in listas:
        columnas = []
        for ck in cd[k][0].keys():
            muestra = cd[k][0].get(ck)
            low = ck.lower()
            tipo = "moneda" if any(p in low for p in ("valor", "importe", "precio", "monto", "costo", "total")) and _es_numero(muestra) else ("numero" if _es_numero(muestra) and any(p in low for p in ("cantidad", "nivel", "qty")) else "texto")
            columnas.append({"clave": ck, "etiqueta": _etiqueta_de(ck), "tipo": tipo, "alinear": "der" if tipo != "texto" else "izq", "detalle": ""})
        tots = [{"clave": t, "etiqueta": {"impuesto": "IVA", "iva": "IVA"}.get(t, _etiqueta_de(t)), "tipo": "moneda", "destacado": t == "total"} for t in totales_claves] if k == listas[0] else []
        tablas.append({"clave": k, "titulo": "Partidas" if k == "items" else _etiqueta_de(k), "columnas": columnas[:MAX_COLUMNAS], "totales": tots})
    return {"documento": {"etiqueta": "", "numero": numero, "area": ""}, "tarjetas": tarjetas[:MAX_TARJETAS], "adjuntos": True, "tablas": tablas[:MAX_TABLAS]}


# ── Armado ────────────────────────────────────────────────────────────────

ESTATUS = {
    "en_aprobacion": ("En espera de aprobación", "turno"),
    "aprobada": ("Aprobada", "ok"),
    "rechazada": ("Rechazada", "no"),
    "sustituida": ("Sustituida por una modificación", "neutro"),
    "cancelada": ("Cancelada", "neutro"),
    "error_configuracion": ("Pendiente de configuración", "aviso"),
}


def _tam(n: Optional[int]) -> str:
    if not n:
        return ""
    for unidad in ("B", "KB", "MB", "GB"):
        if n < 1024 or unidad == "GB":
            return f"{n:.0f} {unidad}" if unidad in ("B", "KB") else f"{n:.1f} {unidad}"
        n /= 1024
    return ""


def _ext(nombre: str) -> str:
    e = (nombre or "").rsplit(".", 1)[-1].lower() if "." in (nombre or "") else ""
    return {"jpeg": "jpg", "xlsx": "xls", "docx": "doc", "pptx": "ppt"}.get(e, e)[:4] or "arch"


def armar(cfg: Optional[Dict[str, Any]], *, card_data: Dict[str, Any], folio: str, flujo_nombre: str, company_name: str,
          origen_clave: str, company_group: str, tenant_id: str, requester_nombre: str, status: str, created_at: Optional[datetime],
          archivos: List[Dict[str, Any]], resumen_cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Estructura lista para pintar. archivos: [{id, nombre, size_bytes, url, tipo}] (solo los de entrada se muestran)."""
    cd = card_data or {}
    c = cfg if (cfg and (cfg.get("tarjetas") or cfg.get("tablas"))) else inferir(cd, resumen_cfg)
    doc = c.get("documento") or {}
    numero_clave = doc.get("numero") or "folio"
    numero = folio if numero_clave == "folio" else (formatear(_valor(cd, numero_clave)) or folio)
    est_txt, est_tono = ESTATUS.get(status, (status, "neutro"))

    tarjetas = []
    for t in c.get("tarjetas") or []:
        v = formatear(_valor(cd, t["clave"]), t.get("tipo", "texto"))
        if v:
            tarjetas.append({"etiqueta": t.get("etiqueta") or _etiqueta_de(t["clave"]), "valor": v})

    tablas = []
    for t in c.get("tablas") or []:
        filas_src = _valor(cd, t["clave"])
        if not isinstance(filas_src, list) or not filas_src:
            continue
        cols = t.get("columnas") or []
        filas = []
        for f in filas_src:
            if not isinstance(f, dict):
                continue
            celdas = []
            for col in cols:
                v = formatear(_valor(f, col["clave"]), col.get("tipo", "texto"))
                det = formatear(_valor(f, col["detalle"])) if col.get("detalle") else ""
                celdas.append({"valor": v, "detalle": det})
            filas.append(celdas)
        totales = []
        for tt in t.get("totales") or []:
            v = formatear(_valor(cd, tt["clave"]), tt.get("tipo", "moneda"))
            if v:
                totales.append({"etiqueta": tt.get("etiqueta") or _etiqueta_de(tt["clave"]), "valor": v, "destacado": bool(tt.get("destacado"))})
        # el total se alinea bajo la ultima columna numerica
        col_total = max([i for i, col in enumerate(cols) if col.get("tipo") in ("moneda", "numero")] or [len(cols) - 1])
        tablas.append({"titulo": t.get("titulo") or _etiqueta_de(t["clave"]), "columnas": [{"etiqueta": col.get("etiqueta"), "alinear": col.get("alinear", "izq"), "tipo": col.get("tipo", "texto")} for col in cols],
                       "filas": filas, "totales": totales, "col_total": col_total})

    adjuntos = []
    if c.get("adjuntos", True):
        for a in archivos or []:
            if a.get("tipo", "entrada") not in ("entrada", "adjunto_aprobador"):
                continue
            adjuntos.append({"id": a.get("id"), "nombre": a.get("nombre"), "ext": _ext(a.get("nombre") or ""), "tamano": _tam(a.get("size_bytes")), "url": a.get("url")})

    fecha = f"{created_at.day} {MESES[created_at.month - 1]} {created_at.year}, {created_at.strftime('%H:%M')}" if created_at else ""
    return {
        "cabecera": {
            "flujo": flujo_nombre, "etiqueta": doc.get("etiqueta") or flujo_nombre, "numero": numero, "numero_es_folio": numero_clave == "folio",
            "folio": folio, "fecha": fecha, "empresa": company_name or origen_clave,
            "solicitado_por": requester_nombre, "area": doc.get("area") or "", "grupo": company_group, "filial": tenant_id,
        },
        "estatus": {"texto": est_txt, "tono": est_tono},
        "tarjetas": tarjetas, "adjuntos": adjuntos, "tablas": tablas,
    }
