"""Motor · resumen de un tramite segun la configuracion del flujo.

Cada flujo dice que campos de cardData son su resumen (clave, etiqueta, tipo) y cual
es el numero de documento visible. Lo usan la tabla de tramites, el correo y el detalle,
asi que se configura en un solo lugar. Sin configuracion, se infiere algo razonable.
"""
from typing import Any, Dict, List, Optional

TIPOS = ("texto", "moneda", "numero", "fecha")
MAX_CAMPOS = 4

# Claves que, si existen en cardData, se toman como resumen cuando el flujo no configuro nada
_POR_DEFECTO = [("numerosolicitud", "Solicitud", "texto"), ("proveedor", "Proveedor", "texto"), ("total", "Total", "moneda"),
                ("cuenta", "Cuenta", "texto"), ("descripcion", "Descripción", "texto"), ("codigoActivo", "Activo", "texto")]


def normalizar(cfg: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Valida y limpia la configuracion. Lanza ValueError con mensaje en espanol."""
    cfg = cfg or {}
    numero = str(cfg.get("numero") or "folio").strip()
    if not numero.replace("_", "").replace(".", "").isalnum():
        raise ValueError("El campo de número de documento solo lleva letras, números y punto")
    campos = []
    for i, c in enumerate(cfg.get("campos") or []):
        clave = str(c.get("clave") or "").strip()
        if not clave:
            continue
        if not clave.replace("_", "").replace(".", "").isalnum():
            raise ValueError(f"La clave «{clave}» solo lleva letras, números y punto")
        tipo = str(c.get("tipo") or "texto")
        if tipo not in TIPOS:
            raise ValueError(f"Tipo «{tipo}» no válido; usa {', '.join(TIPOS)}")
        campos.append({"clave": clave, "etiqueta": str(c.get("etiqueta") or clave).strip()[:40], "tipo": tipo})
    if len(campos) > MAX_CAMPOS:
        raise ValueError(f"Máximo {MAX_CAMPOS} campos de resumen")
    return {"numero": numero, "campos": campos}


def _valor(card_data: Dict[str, Any], ruta: str) -> Any:
    actual: Any = card_data
    for parte in ruta.split("."):
        if not isinstance(actual, dict) or parte not in actual:
            return None
        actual = actual[parte]
    return actual


def _campos(cfg: Optional[Dict[str, Any]], card_data: Dict[str, Any]) -> List[Dict[str, str]]:
    if cfg and cfg.get("campos"):
        return cfg["campos"]
    return [{"clave": k, "etiqueta": e, "tipo": t} for k, e, t in _POR_DEFECTO if _valor(card_data, k) is not None][:MAX_CAMPOS]


def formatear(valor: Any, tipo: str) -> str:
    if valor is None or valor == "":
        return ""
    if tipo == "moneda":
        try:
            return f"${float(str(valor).replace(',', '')):,.2f}"
        except ValueError:
            return str(valor)
    if tipo == "numero":
        try:
            n = float(str(valor).replace(",", ""))
            return f"{int(n):,}" if n.is_integer() else f"{n:,.2f}"
        except ValueError:
            return str(valor)
    if tipo == "fecha":
        return str(valor)[:10]
    return str(valor)


def resumen(cfg: Optional[Dict[str, Any]], card_data: Dict[str, Any], folio: str) -> Dict[str, Any]:
    """{'numero': '000777', 'campos': [{'etiqueta': 'Total', 'valor': '$150,000.00', 'tipo': 'moneda', 'clave': 'total'}, ...], 'texto': 'Solicitud 000777 · Total $150,000.00'}"""
    card_data = card_data or {}
    numero_clave = (cfg or {}).get("numero") or ("numerosolicitud" if card_data.get("numerosolicitud") else "folio")
    numero = folio if numero_clave == "folio" else formatear(_valor(card_data, numero_clave), "texto") or folio
    campos = []
    for c in _campos(cfg, card_data):
        v = formatear(_valor(card_data, c["clave"]), c.get("tipo", "texto"))
        if v:
            campos.append({"clave": c["clave"], "etiqueta": c.get("etiqueta") or c["clave"], "tipo": c.get("tipo", "texto"), "valor": v})
    return {"numero": numero, "numero_es_folio": numero_clave == "folio", "campos": campos, "texto": " · ".join(f"{c['etiqueta']} {c['valor']}" for c in campos)}


def secciones(card_data: Dict[str, Any], cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Para el detalle: lo escalar como clave/valor (con la etiqueta configurada si la hay) y cada lista de objetos como tabla.
    Los campos que ya salen en el resumen (y el numero de documento) no se repiten."""
    campos_cfg = _campos(cfg, card_data or {})
    etiquetas = {c["clave"]: c.get("etiqueta") for c in campos_cfg}
    tipos = {c["clave"]: c.get("tipo", "texto") for c in campos_cfg}
    ya = set(etiquetas) | {(cfg or {}).get("numero") or ("numerosolicitud" if (card_data or {}).get("numerosolicitud") else "")}
    escalares, tablas = [], []
    for k, v in (card_data or {}).items():
        if k in ya:
            continue
        if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
            columnas: List[str] = []
            for fila in v:
                for ck in fila.keys():
                    if ck not in columnas:
                        columnas.append(ck)
            tablas.append({"clave": k, "titulo": etiquetas.get(k) or k, "columnas": columnas, "filas": [{ck: ("" if fila.get(ck) is None else str(fila.get(ck))) for ck in columnas} for fila in v]})
        elif isinstance(v, (dict, list)):
            escalares.append({"clave": k, "etiqueta": etiquetas.get(k) or k, "valor": str(v)[:300]})
        else:
            escalares.append({"clave": k, "etiqueta": etiquetas.get(k) or k, "valor": formatear(v, tipos.get(k, "texto"))})
    return {"escalares": escalares, "tablas": tablas}
