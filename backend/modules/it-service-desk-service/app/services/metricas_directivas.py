"""Metricas directivas del dashboard del IT Service Desk.

El dashboard original responde "vamos a tiempo?"; este calcula lo que
necesita quien toma decisiones: si el trabajo se acumula, donde se
concentran los problemas, como responde cada persona o proveedor, cuando
llegan los tickets y donde se atoran Control de Cambios y Accesos.

Cada pestana trae una conclusion ("veredicto") armada con los datos
reales, con un tono: ok (verde), warn (ambar) o bad (rojo).

Reglas de calculo:
- Abierto = cualquier estatus que no sea de cierre (CERRADOS). Los
  abiertos se cuentan TODOS, sin importar cuando se crearon: un ticket
  viejo que sigue abierto es justo lo que el dueno necesita ver.
- Momento de cierre = resolved_at, o closed_at, o updated_at si el
  estatus ya es de cierre y no trae fecha.
- Las horas mostradas son naturales. Los dias y horas del mapa de calor
  van en hora de Monterrey; la base guarda en UTC.
- Las tablas de bitacora, etapas y accesos se leen completas y se filtran
  en Python: hoy son pocas filas; si crecen a cientos de miles, pasar el
  filtro a SQL.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import text

TZ_MTY = ZoneInfo("America/Monterrey")
CERRADOS = {"resuelto", "cerrado", "terminado", "cancelado", "rechazado"}
TEAM_LABEL = {"especialista-funcional": "Funcional", "especialista-tecnico": "Técnico"}
TIPO_LABEL = {"incidente": "Incidentes", "control_cambios": "Control de Cambios", "control_de_cambios": "Control de Cambios",
              "acceso": "Accesos", "accesos": "Accesos", "solicitud_acceso": "Accesos"}
DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
DIAS_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
               "Septiembre", "Octubre", "Noviembre", "Diciembre"]
HORAS = list(range(9, 19))   # 9:00 a 18:59, horario habil
# Historia minima para hablar de capacidad y de personal: con menos, los
# tickets recien llegados (que es normal que sigan abiertos) distorsionan.
MIN_HABILES_CAPACIDAD = 10
MIN_TICKETS_CAPACIDAD = 20


# ------------------------------------------------------------------ utilidades
def _st(i) -> str:
    s = i.status
    return str(getattr(s, "value", s))


def _abierto(i) -> bool:
    return _st(i) not in CERRADOS


def _cierre(i) -> Optional[datetime]:
    if _abierto(i):
        return None
    return i.resolved_at or i.closed_at or i.updated_at


def _abierto_en(i, t: datetime) -> bool:
    """Estaba abierto en el instante t (para comparar contra el periodo anterior)."""
    if i.created_at > t:
        return False
    c = _cierre(i)
    return c is None or c > t


def _horas(td: timedelta) -> float:
    return td.total_seconds() / 3600


def _pct(a: float, b: float) -> Optional[int]:
    return round(a * 100 / b) if b else None


def _bonito(s: Optional[str]) -> str:
    if not s:
        return "Sin dato"
    s = s.replace("_", " ").replace("-", " ").strip()
    return s[:1].upper() + s[1:]


def _inicio_local(d: date) -> datetime:
    return datetime.combine(d, time(0), TZ_MTY).astimezone(timezone.utc)


def _delta(cur: Optional[float], prev: Optional[float], mas_es_malo: bool, puntos: bool = False) -> Dict[str, str]:
    """Texto y tono de la comparacion contra el periodo anterior."""
    if cur is None or prev is None:
        return {"delta": "sin periodo para comparar", "tono": "flat"}
    if puntos:
        d = round(cur - prev)
        if d == 0:
            return {"delta": "igual que el periodo anterior", "tono": "flat"}
        sube = d > 0
        txt = ("▲ " if sube else "▼ ") + str(abs(d)) + (" punto" if abs(d) == 1 else " puntos")
    else:
        if prev == 0:
            if cur == 0:
                return {"delta": "igual que el periodo anterior", "tono": "flat"}
            return {"delta": "▲ antes no había", "tono": "bad" if mas_es_malo else "good"}
        d = round((cur - prev) * 100 / prev)
        if d == 0:
            return {"delta": "igual que el periodo anterior", "tono": "flat"}
        sube = d > 0
        txt = ("▲ " if sube else "▼ ") + str(abs(d)) + "% vs. periodo anterior"
    malo = sube == mas_es_malo
    return {"delta": txt, "tono": "bad" if malo else "good"}


def _sin_datos(titulo: str) -> Dict[str, str]:
    return {"tono": "warn", "titulo": titulo,
            "detalle": "Las métricas se irán llenando conforme se registren tickets en el periodo.",
            "decidir": ""}


# ------------------------------------------------------------------ armado principal
async def construir_dashboard(
    db,
    incidents: List[Any],
    start: datetime,
    end: datetime,
    scope: str,
    opciones: Dict[str, Any],
    perfil_de: Callable[[str], Awaitable[Dict[str, Any]]],
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    corte = min(end, now)
    largo = end - start
    prev_start, prev_end = start - largo, start

    sev_label = await _catalogo_severidades(db)
    sis_label = {str(r[0]): r[1] for r in (await db.execute(text("select id, name from ticket_systems"))).all()}

    def sev_de(i) -> str:
        sid = i.severity_validated_id or i.severity_reported_id
        return sev_label.get(str(sid), "Sin severidad") if sid else "Sin severidad"

    def sis_de(i) -> str:
        return sis_label.get(str(i.system_id), "Sin sistema") if i.system_id else "Sin sistema"

    creados = [i for i in incidents if start <= i.created_at <= end]
    creados_prev = [i for i in incidents if prev_start <= i.created_at < prev_end]

    actividad = (await db.execute(text(
        "select incident_id, action, performed_at from incident_activity_log order by performed_at"))).all()
    act_por_ticket: Dict[str, List[Any]] = defaultdict(list)
    for r in actividad:
        act_por_ticket[str(r[0])].append(r)

    resumen = _resumen(incidents, creados, creados_prev, start, end, prev_start, corte, now, sev_de, sis_de)
    nombres: Dict[str, str] = {}
    for t in resumen["resueltos"]:
        uid = t.pop("uid")
        if uid and uid not in nombres:
            try:
                nombres[uid] = (await perfil_de(uid)).get("full_name") or "Desconocido"
            except Exception:
                nombres[uid] = "Desconocido"
        t["resolvio"] = nombres.get(uid, "Sin asignar") if uid else "Sin asignar"

    return {
        "scope": scope,
        "rango": {"desde": start.isoformat(), "hasta": end.isoformat()},
        "opciones": opciones,
        "resumen": resumen,
        "problemas": _problemas(creados, sis_de, sev_de),
        "equipo": await _equipo(incidents, start, end, now, act_por_ticket, perfil_de),
        "adopcion": _adopcion(creados),
        "procesos": await _procesos(db, incidents, start, end, now, act_por_ticket),
    }


async def _catalogo_severidades(db) -> Dict[str, str]:
    """El nombre de la columna con la clave (S1, S2...) no se fija aqui:
    se toma la primera que exista de las conocidas."""
    out: Dict[str, str] = {}
    for r in (await db.execute(text("select * from ticket_severities"))).mappings().all():
        etiqueta = next((str(r[k]) for k in ("code", "codigo", "clave", "nombre", "name", "level", "nivel")
                         if k in r and r[k] not in (None, "")), "Severidad")
        out[str(r["id"])] = etiqueta
    return out


# ------------------------------------------------------------------ 1. Resumen
def _cumple_resolucion(lista, now) -> Dict[str, Any]:
    a_tiempo = total = 0
    for i in lista:
        lim = i.sla_resolution_limit
        if not lim:
            continue
        total += 1
        c = _cierre(i)
        if (c and c <= lim) or (not c and now <= lim):
            a_tiempo += 1
    return {"a_tiempo": a_tiempo, "total": total, "porcentaje": _pct(a_tiempo, total)}


def _dias_habiles(desde: date, hasta: date) -> int:
    return sum(1 for k in range((hasta - desde).days + 1) if (desde + timedelta(days=k)).weekday() < 5)


def _resumen(incidents, creados, creados_prev, start, end, prev_start, corte, now, sev_de, sis_de) -> Dict[str, Any]:
    abiertos = [i for i in incidents if _abierto(i)]
    abiertos_prev = sum(1 for i in incidents if _abierto_en(i, start))
    cerrados = [i for i in incidents if (c := _cierre(i)) and start <= c <= end]
    cerrados_prev = sum(1 for i in incidents if (c := _cierre(i)) and prev_start <= c < start)
    backlog = sum(1 for i in abiertos if _st(i) == "en_backlog")
    cump = _cumple_resolucion(creados, now)
    cump_prev = _cumple_resolucion(creados_prev, now)
    reab = _pct(sum(1 for i in creados if (i.reopen_count or 0) > 0), len(creados))
    reab_prev = _pct(sum(1 for i in creados_prev if (i.reopen_count or 0) > 0), len(creados_prev))
    n, n_prev = len(creados), len(creados_prev)

    kpis = [
        {"label": "Nuevos en el periodo", "valor": str(n), **_delta(n, n_prev, mas_es_malo=True)},
        {"label": "Abiertos hoy", "valor": str(len(abiertos)),
         **_delta(len(abiertos), abiertos_prev, mas_es_malo=True)},
        {"label": "Resueltos en el periodo", "valor": str(len(cerrados)),
         **_delta(len(cerrados), cerrados_prev, mas_es_malo=False)},
        {"label": "Sin asignar (backlog)", "valor": str(backlog),
         "delta": "esperando asignación" if backlog else "ninguno sin asignar", "tono": "bad" if backlog else "good"},
        {"label": "Cumplimiento de resolución",
         "valor": (str(cump["porcentaje"]) + "%") if cump["porcentaje"] is not None else "—",
         **_delta(cump["porcentaje"], cump_prev["porcentaje"], mas_es_malo=False, puntos=True)},
        {"label": "Reabiertos", "valor": (str(reab) + "%") if reab is not None else "—",
         **_delta(reab, reab_prev, mas_es_malo=True, puntos=True)},
    ]

    # Ingesta y flujo: por dia si el periodo es de dos meses o menos; por semana si es mas largo
    ini_local = start.astimezone(TZ_MTY).date()
    fin_local = corte.astimezone(TZ_MTY).date()
    if (fin_local - ini_local).days <= 62:
        unidad, paso = "dia", timedelta(days=1)
        cubetas = [ini_local + timedelta(days=k) for k in range((fin_local - ini_local).days + 1)]
    else:
        unidad, paso = "semana", timedelta(days=7)
        lunes0 = ini_local - timedelta(days=ini_local.weekday())
        cubetas = [lunes0 + timedelta(weeks=k) for k in range((fin_local - lunes0).days // 7 + 1)]
    flujo = {"unidad": unidad, "etiquetas": [], "fin_de_semana": [], "creados": [], "resueltos": [], "abiertos": []}
    for ws in cubetas:
        a, b = _inicio_local(ws), _inicio_local(ws + paso)
        flujo["etiquetas"].append((DIAS[ws.weekday()].lower() + " " if unidad == "dia" else "sem. ")
                                  + str(ws.day) + " " + MESES[ws.month - 1])
        flujo["fin_de_semana"].append(unidad == "dia" and ws.weekday() >= 5)
        flujo["creados"].append(sum(1 for i in incidents if a <= i.created_at < b))
        flujo["resueltos"].append(sum(1 for i in incidents if (c := _cierre(i)) and a <= c < b))
        flujo["abiertos"].append(sum(1 for i in incidents if _abierto_en(i, min(b, now))))

    habiles = max(1, _dias_habiles(ini_local, fin_local))
    entran_dia = round(n / habiles, 1)
    cierran_dia = round(len(cerrados) / habiles, 1)
    pico_v = max(flujo["creados"]) if flujo["creados"] else 0
    pico_i = flujo["creados"].index(pico_v) if pico_v else None
    ingesta = {
        "total": n, "prom_habil": entran_dia,
        "pico": {"valor": pico_v, "etiqueta": flujo["etiquetas"][pico_i] if pico_i is not None else None},
        "prev_total": n_prev, "delta_pct": round((n - n_prev) * 100 / n_prev) if n_prev else None,
    }

    # Antiguedad de lo abierto
    edad = {"Menos de 1 día": 0, "1 a 3 días": 0, "3 a 7 días": 0, "Más de 7 días": 0}
    for i in abiertos:
        d = _horas(now - i.created_at) / 24
        k = "Menos de 1 día" if d < 1 else "1 a 3 días" if d < 3 else "3 a 7 días" if d < 7 else "Más de 7 días"
        edad[k] += 1

    # Porcentaje del limite de resolucion que se consume, por severidad
    por_sev: Dict[str, List[tuple]] = defaultdict(list)
    for i in cerrados:
        lim = i.sla_resolution_limit
        if not lim or lim <= i.created_at:
            continue
        c = _cierre(i)
        por_sev[sev_de(i)].append((_horas(c - i.created_at) * 100 / _horas(lim - i.created_at), _horas(c - i.created_at)))
    severidad = [{"severidad": s, "consumo": round(sum(x[0] for x in v) / len(v)),
                  "horas": round(sum(x[1] for x in v) / len(v), 1), "tickets": len(v)}
                 for s, v in sorted(por_sev.items())]

    # Tickets resueltos en el periodo, del mas reciente al mas antiguo. Cuenta
    # el momento de la resolucion: el paso automatico a "cerrado" solo termina
    # la ventana para reabrir y no vuelve a contar el ticket.
    resueltos_lista = []
    for i in sorted(cerrados, key=lambda x: _cierre(x), reverse=True):
        c = _cierre(i)
        lim = i.sla_resolution_limit
        resueltos_lista.append({
            "folio": i.folio, "titulo": i.title, "sistema": sis_de(i), "severidad": sev_de(i),
            "uid": str(i.assigned_to_user_id) if i.assigned_to_user_id else None,
            "resuelto": c.astimezone(TZ_MTY).strftime("%d/%m %H:%M"),
            "horas": round(_horas(c - i.created_at), 1),
            "cumplio": None if not lim else c <= lim,
        })

    # Capacidad del equipo: lo que entra contra lo que el equipo alcanza a sacar.
    # Personas = quienes tienen tickets abiertos o cerraron alguno en el periodo.
    personas = len({str(i.assigned_to_user_id) for i in incidents if i.assigned_to_user_id
                    and (_abierto(i) or ((c := _cierre(i)) and start <= c <= end))})
    por_persona = round(len(cerrados) / habiles / personas, 2) if personas else None
    faltan = round((n - len(cerrados)) / habiles / por_persona, 1) if por_persona and n > len(cerrados) else 0
    dias_acum = round(len(abiertos) / (len(cerrados) / habiles), 1) if cerrados else None
    proyeccion = None
    if ingesta["delta_pct"] and ingesta["delta_pct"] > 0 and n_prev >= 5 and por_persona:
        en_3 = entran_dia * (1 + ingesta["delta_pct"] / 100) ** 3
        proyeccion = {"entrarian_dia": round(en_3, 1),
                      "personas_mas": max(0, round(en_3 / por_persona - personas))}
    suficiente = habiles >= MIN_HABILES_CAPACIDAD and n >= MIN_TICKETS_CAPACIDAD
    if not suficiente:
        conclusion = ("Para estimar si hace falta personal se necesitan al menos " + str(MIN_HABILES_CAPACIDAD)
                      + " días hábiles y " + str(MIN_TICKETS_CAPACIDAD) + " tickets en el periodo; hoy hay "
                      + str(habiles) + " días y " + str(n) + " tickets.")
        proyeccion = None
    elif not personas or not cerrados:
        conclusion = "Aún no hay suficientes tickets resueltos en el periodo para medir la capacidad del equipo."
    elif faltan > 0:
        conclusion = ("Para resolver todo lo que entra hacen falta " + str(faltan)
                      + (" persona más." if faltan == 1 else " personas más."))
    else:
        conclusion = "El equipo actual alcanza a resolver todo lo que entra."
    if proyeccion and proyeccion["personas_mas"] > 0:
        conclusion += (" Si la entrada sigue creciendo " + str(ingesta["delta_pct"]) + "% por periodo, en tres periodos entrarían "
                       + str(proyeccion["entrarian_dia"]) + " al día: harían falta unas "
                       + str(proyeccion["personas_mas"]) + " personas más.")
    capacidad = {"entran_dia": entran_dia, "cierran_dia": cierran_dia, "personas": personas,
                 "cierres_persona_dia": round(por_persona, 1) if por_persona else None,
                 "abiertos_persona": round(len(abiertos) / personas, 1) if personas else None,
                 "dias_acumulados": dias_acum, "conclusion": conclusion, "suficiente": suficiente}

    # Veredicto. Solo cuenta como acumulacion lo que ya vencio su SLA sin
    # cerrarse; un ticket recien llegado que sigue en tiempo no es atraso.
    vencidos = [i for i in abiertos if i.sla_resolution_limit and i.sla_resolution_limit < now]
    viejos = edad["Más de 7 días"]
    pct = cump["porcentaje"]

    def _t(k: int, uno: str, varios: str) -> str:
        return str(k) + " " + (uno if k == 1 else varios)

    if not incidents:
        veredicto = _sin_datos("Todavía no hay tickets para analizar.")
    elif vencidos:
        veredicto = {
            "tono": "bad" if (pct is not None and pct < 85) or len(vencidos) >= 3 else "warn",
            "titulo": "Se está acumulando trabajo: " + _t(len(vencidos), "ticket abierto ya venció", "tickets abiertos ya vencieron") + " su SLA.",
            "detalle": "Entran " + str(entran_dia) + " tickets por día hábil y el equipo resuelve " + str(cierran_dia) + ".",
            "decidir": "Reforzar al equipo que más carga tiene o depurar el backlog antes de que se venzan más.",
        }
    elif suficiente and entran_dia > cierran_dia * 1.05:
        veredicto = {
            "tono": "warn",
            "titulo": "Entran " + str(entran_dia) + " tickets por día hábil y el equipo resuelve " + str(cierran_dia)
                      + ": la capacidad está al límite.",
            "detalle": ("La entrada " + ("creció " if ingesta["delta_pct"] > 0 else "bajó ") + str(abs(ingesta["delta_pct"]))
                        + "% contra el periodo anterior. " if ingesta["delta_pct"] else "")
                       + "En el periodo quedaron " + str(len(abiertos) - abiertos_prev if len(abiertos) > abiertos_prev else 0)
                       + " tickets más abiertos de los que había al empezar.",
            "decidir": capacidad["conclusion"],
        }
    elif pct is not None and pct < 85:
        veredicto = {
            "tono": "bad",
            "titulo": "El cumplimiento de resolución está en " + str(pct) + "%: se resolvieron tickets fuera de tiempo.",
            "detalle": str(cump["total"] - cump["a_tiempo"]) + " de " + str(cump["total"]) + " tickets del periodo se resolvieron tarde.",
            "decidir": "Revisar en la pestaña de equipo quién concentra los incumplimientos y en qué sistemas.",
        }
    elif viejos:
        veredicto = {
            "tono": "warn",
            "titulo": "El equipo va al corriente, pero hay " + _t(viejos, "ticket abierto", "tickets abiertos") + " con más de una semana.",
            "detalle": "Siguen dentro de su SLA, pero conviene revisar por qué tardan.",
            "decidir": "Pedir el estado de los tickets más antiguos y decidir si se escalan o se cierran.",
        }
    elif suficiente:
        veredicto = {
            "tono": "ok",
            "titulo": "El equipo resuelve lo que entra: " + str(entran_dia) + " tickets entran y " + str(cierran_dia)
                      + " se resuelven por día hábil.",
            "detalle": "Ningún ticket abierto tiene el SLA vencido" + (" y " + _t(len(abiertos), "sigue abierto", "siguen abiertos") + " en tiempo." if abiertos else "."),
            "decidir": "Mantener la operación; vigilar que la entrada no rebase a lo que se resuelve.",
        }
    else:
        veredicto = {
            "tono": "ok",
            "titulo": "El servicio va al corriente: ningún ticket abierto tiene el SLA vencido.",
            "detalle": "En el periodo entraron " + _t(n, "ticket", "tickets") + " y se resolvieron " + str(len(cerrados))
                       + (("; " + _t(len(abiertos), "abierto sigue", "abiertos siguen") + " en tiempo.") if abiertos else "."),
            "decidir": "Mantener la operación. " + capacidad["conclusion"],
        }
    return {"veredicto": veredicto, "kpis": kpis, "ingesta": ingesta, "flujo": flujo, "capacidad": capacidad,
            "edad": [{"rango": k, "tickets": v} for k, v in edad.items()], "severidad": severidad,
            "resueltos": resueltos_lista}


# ------------------------------------------------------------------ 2. Problemas
def _problemas(creados, sis_de, sev_de) -> Dict[str, Any]:
    por_sis: Dict[str, int] = defaultdict(int)
    for i in creados:
        por_sis[sis_de(i)] += 1
    orden = sorted(por_sis.items(), key=lambda x: -x[1])
    top, resto = orden[:8], orden[8:]
    pareto = [{"sistema": s, "tickets": n} for s, n in top]
    if resto:
        pareto.append({"sistema": "Otros", "tickets": sum(n for _, n in resto)})

    sistemas = [s for s, _ in top]
    sevs = sorted({sev_de(i) for i in creados})
    celdas: Dict[tuple, int] = defaultdict(int)
    for i in creados:
        if sis_de(i) in sistemas:
            celdas[(sis_de(i), sev_de(i))] += 1
    mapa = {"sistemas": sistemas, "severidades": sevs,
            "valores": [[x, y, celdas[(s, v)]] for y, s in enumerate(sistemas) for x, v in enumerate(sevs)]}

    por_emp: Dict[str, int] = defaultdict(int)
    for i in creados:
        por_emp[i.requester_company_name or "Sin empresa"] += 1
    empresas = [{"empresa": e, "tickets": n, "por_10_usuarios": None}
                for e, n in sorted(por_emp.items(), key=lambda x: -x[1])]

    total = len(creados)
    if not total:
        veredicto = _sin_datos("Todavía no hay tickets en el periodo para ver dónde se concentran.")
    else:
        n = min(3, len(orden))
        share = _pct(sum(c for _, c in orden[:n]), total)
        nombres = [s for s, _ in orden[:n]]
        lista = nombres[0] if n == 1 else ", ".join(nombres[:-1]) + " y " + nombres[-1]
        veredicto = {
            "tono": "bad" if share >= 60 and total >= 10 else "warn",
            "titulo": (str(n) + " sistemas concentran" if n > 1 else "Un sistema concentra") + " el "
                      + str(share) + "% de los tickets: " + lista + ".",
            "detalle": "La empresa que más tickets levanta es " + empresas[0]["empresa"] + ", con "
                       + str(empresas[0]["tickets"]) + " de " + str(total) + ".",
            "decidir": "Dónde invertir en capacitación, en corrección del sistema o en soporte dedicado.",
        }
    return {"veredicto": veredicto, "pareto": pareto, "mapa": mapa, "empresas": empresas}


# ------------------------------------------------------------------ 3. Equipo y proveedores
async def _equipo(incidents, start, end, now, act_por_ticket, perfil_de) -> Dict[str, Any]:
    por_usr: Dict[str, Dict[str, Any]] = {}
    for i in incidents:
        uid = i.assigned_to_user_id
        if not uid:
            continue
        uid = str(uid)
        c = _cierre(i)
        relevante = _abierto(i) or (c and start <= c <= end)
        if not relevante:
            continue
        u = por_usr.setdefault(uid, {"abiertos": 0, "resueltos": 0, "horas": [], "incumplidos": 0,
                                     "reasignados": 0, "equipo": TEAM_LABEL.get(i.assigned_team or "", "—"),
                                     "a_tiempo": 0})
        if _abierto(i):
            u["abiertos"] += 1
            if (i.sla_resolution_limit and i.sla_resolution_limit < now) or \
               (i.sla_response_limit and not i.first_response_at and i.sla_response_limit < now):
                u["incumplidos"] += 1
        else:
            u["resueltos"] += 1
            u["horas"].append(_horas(c - i.created_at))
            tarde_res = i.sla_resolution_limit and c > i.sla_resolution_limit
            resp = i.first_response_at or c
            tarde_resp = i.sla_response_limit and resp > i.sla_response_limit
            if tarde_res or tarde_resp:
                u["incumplidos"] += 1
            else:
                u["a_tiempo"] += 1
        if any(r[1] == "reasignacion_manual" for r in act_por_ticket.get(str(i.id), [])):
            u["reasignados"] += 1

    personas, areas = [], defaultdict(lambda: {"resueltos": 0, "a_tiempo": 0, "horas": []})
    for uid, u in por_usr.items():
        try:
            perfil = await perfil_de(uid)
        except Exception:
            perfil = {}
        area = perfil.get("departamento") or "Sin área"
        prom = round(sum(u["horas"]) / len(u["horas"]), 1) if u["horas"] else None
        personas.append({"nombre": perfil.get("full_name") or "Desconocido", "equipo": u["equipo"], "area": area,
                         "abiertos": u["abiertos"], "resueltos": u["resueltos"], "prom_horas": prom,
                         "incumplidos": u["incumplidos"], "reasignados": u["reasignados"]})
        a = areas[area]
        a["resueltos"] += u["resueltos"]
        a["a_tiempo"] += u["a_tiempo"]
        a["horas"] += u["horas"]
    personas.sort(key=lambda p: (-p["abiertos"], -p["resueltos"]))
    lista_areas = sorted(
        [{"area": k, "resueltos": v["resueltos"], "cumplimiento": _pct(v["a_tiempo"], v["resueltos"]),
          "prom_horas": round(sum(v["horas"]) / len(v["horas"]), 1) if v["horas"] else None}
         for k, v in areas.items() if v["resueltos"]],
        key=lambda x: (x["cumplimiento"] if x["cumplimiento"] is not None else 101))

    if not personas:
        veredicto = _sin_datos("Todavía no hay tickets asignados en el periodo.")
    else:
        partes, tono = [], "ok"
        peor = lista_areas[0] if lista_areas else None
        if peor and peor["cumplimiento"] is not None and peor["cumplimiento"] < 90:
            tono = "bad" if peor["cumplimiento"] < 80 else "warn"
            titulo = (peor["area"] + " tiene el menor cumplimiento: " + str(peor["cumplimiento"])
                      + "%, con " + str(peor["prom_horas"]) + " horas promedio de resolución.")
        else:
            titulo = "Todas las áreas y proveedores resuelven a tiempo en el periodo."
        abiertos_tot = sum(p["abiertos"] for p in personas)
        if abiertos_tot and len(personas) >= 3:
            dos = sum(p["abiertos"] for p in personas[:2])
            share = _pct(dos, abiertos_tot)
            if share >= 50:
                partes.append("La carga está desbalanceada: dos personas tienen el " + str(share) + "% de los tickets abiertos.")
                tono = tono if tono == "bad" else "warn"
        if not partes:
            partes.append("La carga de tickets abiertos está repartida.")
        veredicto = {"tono": tono, "titulo": titulo, "detalle": " ".join(partes),
                     "decidir": "Revisar el acuerdo de servicio con quien incumple y redistribuir la carga si hace falta."}
    return {"veredicto": veredicto, "personas": personas, "areas": lista_areas}


# ------------------------------------------------------------------ 4. Adopcion (parte local)
def _adopcion(creados) -> Dict[str, Any]:
    celdas: Dict[tuple, int] = defaultdict(int)
    fuera = 0
    for i in creados:
        t = i.created_at.astimezone(TZ_MTY)
        if t.weekday() < 5 and t.hour in HORAS:
            celdas[(t.weekday(), t.hour)] += 1
        else:
            fuera += 1
    valores = [[x, y, celdas[(y, h)]] for y in range(5) for x, h in enumerate(HORAS)]
    if not creados:
        veredicto = _sin_datos("Todavía no hay tickets en el periodo para ver cuándo llegan.")
    else:
        dia, hora = max(celdas, key=celdas.get) if celdas else (None, None)
        titulo = ("El momento con más tickets es el " + DIAS_LARGO[dia] + " a las " + str(hora) + ":00."
                  if dia is not None else "Todos los tickets del periodo llegaron fuera del horario hábil.")
        veredicto = {"tono": "ok", "titulo": titulo,
                     "detalle": str(fuera) + (" ticket llegó" if fuera == 1 else " tickets llegaron")
                                + " fuera del horario hábil (lunes a viernes de 9 a 19 h).",
                     "decidir": "En qué horario reforzar el soporte y qué temas capacitar."}
    return {"veredicto": veredicto, "horas": [str(h) + " h" for h in HORAS], "dias": DIAS[:5],
            "mapa": valores, "fuera_de_horario": fuera,
            # Se conectan en el paso 2 (endpoints internos de auth, admin y asistente)
            "usuarios_activos": None, "asistente": None, "temas_sin_respuesta": None, "kpis": None}


# ------------------------------------------------------------------ 5. Cambios y accesos
async def _procesos(db, incidents, start, end, now, act_por_ticket) -> Dict[str, Any]:
    ids_periodo = {str(i.id) for i in incidents if start <= i.created_at <= end}

    cdc_ids = {str(r[0]) for r in (await db.execute(text("select incident_id from control_cambios_detalle"))).all()}
    etapas = (await db.execute(text(
        "select incident_id, etapa, created_at from control_cambios_etapas order by created_at"))).all()
    por_cdc: Dict[str, List[Any]] = defaultdict(list)
    for r in etapas:
        iid = str(r[0])
        if iid in cdc_ids and iid in ids_periodo:
            por_cdc[iid].append(r)

    llegan: Dict[str, set] = defaultdict(set)
    posicion: Dict[str, List[int]] = defaultdict(list)
    duraciones: Dict[str, List[float]] = defaultdict(list)
    for iid, filas in por_cdc.items():
        for k, r in enumerate(filas):
            llegan[r[1]].add(iid)
            posicion[r[1]].append(k)
            if k + 1 < len(filas):
                duraciones[r[1]].append(_horas(filas[k + 1][2] - r[2]) / 24)
    orden_etapas = sorted(llegan, key=lambda e: sum(posicion[e]) / len(posicion[e]))
    embudo = [{"etapa": _bonito(e), "cambios": len(llegan[e])} for e in orden_etapas]
    dias_etapa = [{"etapa": _bonito(e), "dias": round(sum(duraciones[e]) / len(duraciones[e]), 1)}
                  for e in orden_etapas if duraciones[e]]

    # Accesos: horas entre cada accion de la bitacora, por mes de creacion
    acc_ids = {str(r[0]) for r in (await db.execute(text("select incident_id from acc_solicitudes"))).all()}
    creado_en = {str(i.id): i.created_at for i in incidents}
    meses: List[tuple] = []
    d = now.astimezone(TZ_MTY).date().replace(day=1)
    for _ in range(4):
        meses.insert(0, (d.year, d.month))
        d = (d - timedelta(days=1)).replace(day=1)
    pasos: Dict[str, Dict[tuple, List[float]]] = defaultdict(lambda: defaultdict(list))
    for iid in acc_ids:
        if iid not in creado_en:
            continue
        m = creado_en[iid].astimezone(TZ_MTY)
        clave = (m.year, m.month)
        if clave not in meses:
            continue
        filas = act_por_ticket.get(iid, [])
        for k in range(len(filas) - 1):
            pasos[_bonito(filas[k][1])][clave].append(_horas(filas[k + 1][2] - filas[k][2]))
    accesos = {"meses": [MESES_LARGO[mm - 1] for _, mm in meses],
               "pasos": [{"paso": p, "horas": [round(sum(v[c]) / len(v[c]), 1) if v[c] else 0 for c in meses]}
                         for p, v in pasos.items()]}

    if not por_cdc and not pasos:
        veredicto = _sin_datos("Todavía no hay Controles de Cambio ni Solicitudes de Accesos en el periodo.")
    else:
        partes, titulo, tono = [], "", "ok"
        if dias_etapa:
            peor = max(dias_etapa, key=lambda x: x["dias"])
            total = round(sum(x["dias"] for x in dias_etapa), 1)
            titulo = ("Los Controles de Cambio pasan más tiempo en «" + peor["etapa"] + "»: "
                      + str(peor["dias"]) + " de " + str(total) + " días en promedio.")
            tono = "bad" if total and peor["dias"] / total >= 0.4 else "warn"
        if accesos["pasos"]:
            mayor = max(accesos["pasos"], key=lambda p: sum(p["horas"]))
            partes.append("En Accesos, el tramo más largo es el que sigue a «" + mayor["paso"].lower() + "».")
        veredicto = {"tono": tono, "titulo": titulo or "Hay Solicitudes de Accesos en el periodo.",
                     "detalle": " ".join(partes) or "Todavía no hay suficientes etapas registradas para comparar.",
                     "decidir": "Fijar un plazo o un suplente para la etapa más lenta, y recordatorios automáticos."}
    return {"veredicto": veredicto, "embudo": embudo, "dias_etapa": dias_etapa, "accesos": accesos}


def etiqueta_tipo(t: str) -> str:
    return TIPO_LABEL.get(t, _bonito(t))
