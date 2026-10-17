"""Motor · grupos y etapas.

Funciones puras sobre la DEFINICION del flujo (el JSON que se guarda como
snapshot en cada version y en cada instancia). Las usan igual el simulador
y el motor real al recibir un sobre, asi que lo que el simulador muestra es
exactamente lo que haria el motor.
"""
import re
from typing import Any, Dict, List, Optional

# campo  operador  valor   → "total > 100000" · "moneda == MXN" · "empresa != 02|03"
_COND = re.compile(r"^\s*([A-Za-z_][\w\.]*)\s*(>=|<=|==|!=|>|<)\s*(.+?)\s*$")


def _valor(card_data: Dict[str, Any], ruta: str) -> Any:
    """Lee card_data['a']['b'] con la ruta 'a.b'. None si no existe."""
    actual: Any = card_data
    for parte in ruta.split("."):
        if not isinstance(actual, dict) or parte not in actual:
            return None
        actual = actual[parte]
    return actual


def _numero(x: Any) -> Optional[float]:
    try:
        if isinstance(x, bool):
            return None
        return float(str(x).replace(",", ""))
    except (TypeError, ValueError):
        return None


def evaluar_condicion(condicion: Optional[str], card_data: Dict[str, Any]) -> Dict[str, Any]:
    """Regresa {'aplica': bool, 'motivo': str}. Una condicion vacia siempre aplica.
    Una condicion mal escrita o con un campo que no viene en cardData NO aplica,
    y lo dice: mejor omitir una etapa con aviso que aprobar algo por un error de dedo."""
    if not condicion or not condicion.strip():
        return {"aplica": True, "motivo": ""}
    m = _COND.match(condicion)
    if not m:
        return {"aplica": False, "motivo": f"Condición mal escrita: «{condicion}»"}
    campo, op, esperado = m.group(1), m.group(2), m.group(3).strip().strip('"').strip("'")
    real = _valor(card_data, campo)
    if real is None:
        return {"aplica": False, "motivo": f"cardData no trae «{campo}»"}
    n_real, n_esp = _numero(real), _numero(esperado)
    if n_real is not None and n_esp is not None:
        ok = {">": n_real > n_esp, "<": n_real < n_esp, ">=": n_real >= n_esp, "<=": n_real <= n_esp,
              "==": n_real == n_esp, "!=": n_real != n_esp}[op]
    else:
        a, b = str(real).strip().lower(), esperado.lower()
        if op in ("==", "!="):
            ok = (a == b) if op == "==" else (a != b)
        else:
            return {"aplica": False, "motivo": f"«{campo}» no es numérico; solo se puede comparar con == o !="}
    return {"aplica": ok, "motivo": "" if ok else f"No se cumple: {campo} {op} {esperado} (vale {real})"}


def resolver_grupo(grupos: List[Dict[str, Any]], origen_clave: str, requester_user_id: Optional[str]) -> Dict[str, Any]:
    """Orden: miembro explicito → default de la empresa → nada.
    Regresa {'grupo': dict|None, 'via': 'miembro'|'default'|'sin_grupo'}."""
    de_empresa = [g for g in grupos if g.get("activo", True) and g.get("origen_clave") == origen_clave]
    if requester_user_id:
        for g in de_empresa:
            if any(m.get("user_id") == requester_user_id for m in g.get("miembros", [])):
                return {"grupo": g, "via": "miembro"}
    for g in de_empresa:
        if g.get("es_default"):
            return {"grupo": g, "via": "default"}
    return {"grupo": None, "via": "sin_grupo"}


def armar_etapas(grupo: Dict[str, Any], card_data: Dict[str, Any], requester_user_id: Optional[str]) -> List[Dict[str, Any]]:
    """Copia la cascada del grupo aplicando condiciones y la regla de auto-aprobacion.
    Cada etapa sale con status 'pendiente' u 'omitida' (con su nota). Ninguna queda en turno
    aqui: eso lo decide avanzar() en el motor de instancias."""
    etapas = sorted(grupo.get("etapas", []), key=lambda e: e.get("orden", 0))
    auto = grupo.get("auto_aprobacion", "omitir")
    salida: List[Dict[str, Any]] = []
    for i, e in enumerate(etapas, start=1):
        status, nota = "pendiente", ""
        cond = evaluar_condicion(e.get("condicion"), card_data)
        if not cond["aplica"]:
            status, nota = "omitida", cond["motivo"]
        elif requester_user_id and e.get("aprobador_user_id") == requester_user_id:
            if auto == "omitir":
                status, nota = "omitida", "El solicitante es el aprobador de esta etapa"
            else:
                nota = "El solicitante es el aprobador: la decisión sube al siguiente nivel"
        salida.append({
            "orden": i, "nombre": e.get("nombre", f"Etapa {i}"), "tipo": e.get("tipo", "aprobacion"),
            "puesto_esperado": e.get("puesto_esperado"), "condicion": e.get("condicion"),
            "aprobador_user_id": e.get("aprobador_user_id"), "aprobador_nombre": e.get("aprobador_nombre", ""),
            "aprobador_email": e.get("aprobador_email"),
            "suplente_user_id": e.get("suplente_user_id"), "suplente_nombre": e.get("suplente_nombre"),
            "suplente_email": e.get("suplente_email"),
            "comentario_rechazo_obligatorio": e.get("comentario_rechazo_obligatorio", True),
            "status": status, "nota": nota,
        })
    # Si una etapa "sube" (auto_aprobacion = subir) y es la ultima, no hay a donde subir: se omite con aviso.
    for idx, et in enumerate(salida):
        if et["status"] == "pendiente" and et["nota"].startswith("El solicitante es el aprobador: la decisión sube"):
            siguientes = [x for x in salida[idx + 1:] if x["status"] == "pendiente"]
            et["status"] = "omitida"
            if not siguientes:
                et["nota"] += " · no hay siguiente nivel: el trámite quedaría aprobado sin nadie que lo decida"
    return salida


def simular(flujo_def: Dict[str, Any], origen_clave: str, requester_user_id: Optional[str], card_data: Dict[str, Any]) -> Dict[str, Any]:
    """Lo que haria el motor con un sobre: grupo, etapas y a quien le llegaria el primer aviso."""
    r = resolver_grupo(flujo_def.get("grupos", []), origen_clave, requester_user_id)
    if not r["grupo"]:
        return {"via": r["via"], "grupo": None, "etapas": [], "primer_aviso": None,
                "resultado": "error_configuracion", "mensaje": f"No hay grupo de aprobación para la empresa {origen_clave}: el trámite nacería en «error de configuración» y avisaría a TI."}
    etapas = armar_etapas(r["grupo"], card_data, requester_user_id)
    primera = next((e for e in etapas if e["status"] == "pendiente"), None)
    if primera:
        primera["status"] = "en_turno"
        resultado, mensaje = "en_aprobacion", f"El primer aviso le llegaría a {primera['aprobador_nombre'] or '—'}" + (f" (o a {primera['suplente_nombre']})" if primera.get("suplente_nombre") else "") + "."
    else:
        resultado, mensaje = "aprobada", "Todas las etapas se omiten: el trámite se aprobaría en automático y el resultado saldría a la plataforma de inmediato."
    return {"via": r["via"], "grupo": {"id": r["grupo"].get("id"), "nombre": r["grupo"].get("nombre"), "es_default": r["grupo"].get("es_default", False)},
            "etapas": etapas, "primer_aviso": primera, "resultado": resultado, "mensaje": mensaje}
