"""Reportes para presentacion (IT Service Desk).

Calcula los indicadores de un periodo (por fecha de creacion) y arma las laminas en HTML
16:9. El mismo HTML sirve para la vista previa y para el PDF (Gotenberg), asi que lo que
se ve es exactamente lo que se descarga. Las reglas de SLA son las mismas del concentrado
(respuesta) y del Dashboard directivo (resolucion).
"""
import html
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Monterrey")
FINALES = {"resuelto", "cerrado", "terminado", "rechazado", "cancelado"}
ACCESOS = {"control de accesos", "permisos de acceso"}
# La familia sale de la clave del folio. AVAL y PROM son claves viejas, de antes de que esas empresas
# tuvieran familia: AVALANZ hoy esta en Corporativo y Promotora de Eventos en Zignia.
FAMILIAS = {"CORP": "Corporativo", "DYCE": "Dyce", "SPPE": "Sppel", "CNCI": "CNCI", "TODI": "Todito",
            "VNTA": "Vanta Media", "ZIGN": "Zignia", "AVAL": "Corporativo", "PROM": "Zignia"}
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
               "septiembre", "octubre", "noviembre", "diciembre"]
UNIDADES_SOLAS = 99         # cada familia en su fila (sin "Otros"); AVAL cuenta en Corporativo


# ───────────────────────── Reglas por ticket ─────────────────────────
def _final(i) -> bool:
    return (i.status or "") in FINALES


def _cierre(i) -> Optional[datetime]:
    return (i.resolved_at or i.closed_at or i.updated_at) if _final(i) else None


def _vencido_abierto(i, now) -> bool:
    return not _final(i) and bool(i.sla_resolution_limit) and i.sla_resolution_limit < now


def _pct(a: int, b: int) -> Optional[int]:
    return round(100 * a / b) if b else None


def _sla_respuesta(lista) -> Optional[int]:
    """Como el concentrado: primera respuesta (o resolucion) antes del limite, entre los que ya respondieron."""
    ev = [i for i in lista if i.sla_response_limit and (i.first_response_at or i.resolved_at)]
    return _pct(sum(1 for i in ev if (i.first_response_at or i.resolved_at) <= i.sla_response_limit), len(ev))


def _sla_resolucion(lista, now) -> Optional[int]:
    """Como el Dashboard: cerrado antes del limite, o abierto que todavia no vence."""
    ok = tot = 0
    for i in lista:
        lim = i.sla_resolution_limit
        if not lim:
            continue
        tot += 1
        c = _cierre(i)
        if (c and c <= lim) or (not c and now <= lim):
            ok += 1
    return _pct(ok, tot)


def _familia(folio: str) -> str:
    partes = (folio or "").split("-")
    clave = partes[1] if len(partes) >= 3 else ""
    return FAMILIAS.get(clave, clave.title() or "Sin familia")


def _columna_compacta(i, sistemas, modulos) -> str:
    sis = sistemas.get(str(i.system_id)) if i.system_id else None
    mod = modulos.get(str(i.module_id)) if i.module_id else None
    if mod and mod.strip().lower() in ACCESOS:
        return "Accesos"
    if (sis or "").upper() == "TOTVS":
        return mod or "Sin módulo"
    return sis or "Sin sistema"


# ───────────────────────── Calculo del reporte ─────────────────────────
def rango(desde: date, hasta: date):
    return (datetime.combine(desde, time.min, TZ), datetime.combine(hasta + timedelta(days=1), time.min, TZ))


def calcular(tickets, sistemas: Dict[str, str], modulos: Dict[str, str], severidades: Dict[str, str],
             desde: date, hasta: date, now: Optional[datetime] = None, historico=None) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    n = len(tickets)
    resueltos = [i for i in tickets if _cierre(i)]
    abiertos = [i for i in tickets if not _final(i)]
    vencidos = [i for i in tickets if _vencido_abierto(i, now)]
    es_s1 = lambda i: (severidades.get(str(i.severity_validated_id or i.severity_reported_id), "") or "").upper().startswith("S1")

    # Por unidad (familia del folio): las mas grandes solas, el resto en Otros
    por_fam = defaultdict(list)
    for i in tickets:
        por_fam[_familia(i.folio)].append(i)
    orden = sorted(por_fam, key=lambda f: -len(por_fam[f]))
    solas, resto = orden[:UNIDADES_SOLAS], orden[UNIDADES_SOLAS:]
    grupos = [(f, por_fam[f]) for f in solas]
    if resto:
        grupos.append(("Otros", [i for f in resto for i in por_fam[f]]))

    def fila_unidad(nombre, lista):
        return {"unidad": nombre, "tickets": len(lista), "resueltos": sum(1 for i in lista if _cierre(i)),
                "abiertos": sum(1 for i in lista if not _final(i)), "vencidos": sum(1 for i in lista if _vencido_abierto(i, now)),
                "s1": sum(1 for i in lista if es_s1(i)), "sla_resp": _sla_respuesta(lista), "sla_resol": _sla_resolucion(lista, now)}
    unidades = [fila_unidad(f, l) for f, l in grupos]

    # Tickets abiertos al cierre de cada dia habil (backlog): cuenta tambien los que venian
    # de antes del periodo y seguian abiertos, no solo los creados en el rango
    base = historico if historico is not None else tickets
    dias, d = [], desde
    while d <= hasta:
        ini_dia = datetime.combine(d, time.min, TZ)
        fin_dia = min(datetime.combine(d + timedelta(days=1), time.min, TZ), now)
        entraron = sum(1 for i in tickets if ini_dia <= i.created_at < fin_dia)
        resueltos_dia = sum(1 for i in base if (c := _cierre(i)) and ini_dia <= c < fin_dia)
        # Dias habiles siempre; fines de semana solo si hubo movimiento
        if d.weekday() < 5 or entraron or resueltos_dia:
            abiertos_dia = sum(1 for i in base if i.created_at < fin_dia and not ((_cierre(i) or fin_dia) < fin_dia))
            dias.append({"fecha": d.isoformat(), "etiqueta": f"{d.day} {MESES[d.month - 1]}", "tickets": abiertos_dia,
                         "entraron": entraron, "resueltos": resueltos_dia})
        d += timedelta(days=1)

    # Compacto: empresa x columna (TOTVS por modulo, Accesos junto, otros sistemas en una columna)
    def cruce(clave_columna):
        celdas = defaultdict(lambda: defaultdict(int))
        for i in tickets:
            celdas[i.requester_company_name or "Sin empresa"][clave_columna(i)] += 1
        cols = defaultdict(int)
        for fila in celdas.values():
            for k, v in fila.items():
                cols[k] += v
        columnas = sorted(cols, key=lambda k: (-cols[k], k))
        filas = []
        for emp, fila in celdas.items():
            lista = [i for i in tickets if (i.requester_company_name or "Sin empresa") == emp]
            filas.append({"empresa": emp, "celdas": [fila.get(c, 0) for c in columnas], "total": len(lista),
                          "abiertos": sum(1 for i in lista if not _final(i)), "vencidos": sum(1 for i in lista if _vencido_abierto(i, now))})
        filas.sort(key=lambda f: -f["total"])
        return {"columnas": columnas, "totales": [cols[c] for c in columnas], "filas": filas}
    compacto = cruce(lambda i: _columna_compacta(i, sistemas, modulos))

    # Detallado: sistema -> modulo, con una columna por empresa
    empresas = [f["empresa"] for f in compacto["filas"]]
    det = defaultdict(lambda: defaultdict(list))
    for i in tickets:
        sis = sistemas.get(str(i.system_id), "Sin sistema") if i.system_id else "Sin sistema"
        mod = modulos.get(str(i.module_id), "Sin módulo") if i.module_id else "Sin módulo"
        det[sis][mod].append(i)
    detallado = []
    for sis in sorted(det, key=lambda s: -sum(len(v) for v in det[s].values())):
        mods = []
        for mod in sorted(det[sis], key=lambda m: -len(det[sis][m])):
            lista = det[sis][mod]
            mods.append({"modulo": mod, "por_empresa": [sum(1 for i in lista if (i.requester_company_name or "Sin empresa") == e) for e in empresas],
                         "total": len(lista), "abiertos": sum(1 for i in lista if not _final(i)),
                         "vencidos": sum(1 for i in lista if _vencido_abierto(i, now))})
        detallado.append({"sistema": sis, "total": sum(m["total"] for m in mods), "modulos": mods})

    return {
        "periodo": {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "titulo": titulo_periodo(desde, hasta)},
        "kpis": {"total": n, "resueltos": len(resueltos), "pct_resueltos": _pct(len(resueltos), n), "abiertos": len(abiertos),
                 "vencidos": len(vencidos), "sla_resp": _sla_respuesta(tickets), "sla_resol": _sla_resolucion(tickets, now)},
        "unidades": unidades,
        "otros": resto,
        "unidades_total": fila_unidad("Total", tickets),
        "por_dia": dias,
        "compacto": compacto,
        "detallado": {"empresas": empresas, "sistemas": detallado},
        "empresas": sorted(empresas),
    }


TIPOS = (("incidente", "Incidentes"), ("solicitud_acceso", "Solicitudes de acceso"), ("control_cambio", "Controles de cambio"))


def por_tipo(todos, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Tickets del periodo por tipo (todos los tipos, incluidos los Controles de Cambio)."""
    now = now or datetime.now(timezone.utc)
    filas = []
    for clave, nombre in TIPOS:
        lista = [i for i in todos if (getattr(i, "ticket_type", "") or "") == clave]
        filas.append({"tipo": clave, "nombre": nombre, "tickets": len(lista), "resueltos": sum(1 for i in lista if _cierre(i)),
                      "abiertos": sum(1 for i in lista if not _final(i)), "vencidos": sum(1 for i in lista if _vencido_abierto(i, now))})
    return filas


def titulo_periodo(desde: date, hasta: date) -> str:
    if desde.year == hasta.year and desde.month == hasta.month:
        return f"{desde.day} al {hasta.day} {MESES_LARGO[desde.month - 1]} {desde.year}"
    if desde.year == hasta.year:
        return f"{desde.day} {MESES_LARGO[desde.month - 1]} al {hasta.day} {MESES_LARGO[hasta.month - 1]} {desde.year}"
    return f"{desde.day} {MESES_LARGO[desde.month - 1]} {desde.year} al {hasta.day} {MESES_LARGO[hasta.month - 1]} {hasta.year}"


# ───────────────────────── Laminas (HTML 16:9) ─────────────────────────
TEMAS = {
    # Verus: los colores y la barra con el logotipo salen de la presentacion de Verus
    "verus":     {"nombre": "Verus", "pri": "#065744", "bg": "#ffffff", "ink": "#1e2a36", "muted": "#5b6570", "muted2": "#5b6570",
                  "card": "#fbfaf7", "line": "#c3c1bd", "th": "#e2e0dc", "th_ink": "#1e2a36", "alerta": "#b4501f",
                  "bar": "#9fd9bf", "bar_alto": "#065744", "barra": True,
                  "titulo": "#065744", "linea_titulo": "linear-gradient(90deg,#6cf08f,#0a8c6d 60%,#065744)", "estatus": "#0a8c6d",
                  "head_bg": "#065744", "head_ink": "#ffffff", "celda": "#ffffff", "total_bg": "#e6f2ec", "total_ink": "#065744",
                  "top_bg": "#0fcb9e", "top_ink": "#05372b", "grupo_bg": "#e6f2ec", "grupo_ink": "#065744",
                  "kpi_num": "#065744", "hero_bg": "#065744", "hero_ink": "#ffffff", "hero_sub": "#bfe6d6",
                  "hal_bg": "#eef7f2", "hal_line": "#cde6d9", "acc_bg": "#fdf1ea", "acc_line": "#f3d2bf",
                  "fuente": "Helvetica,Arial,'Liberation Sans',sans-serif"},
    "intranet":  {"nombre": "Azul intranet", "pri": "#1a4fa0", "bg": "#ffffff", "ink": "#0f2440", "muted": "#64748b", "muted2": "#64748b", "card": "#f8fafc", "line": "#d5dde8", "th": "#e7edf5", "th_ink": "#0f2440", "alerta": "#c2410c", "bar": "#8fb0dc", "bar_alto": "#1a4fa0"},
    "sobrio":    {"nombre": "Sobrio", "pri": "#334155", "bg": "#ffffff", "ink": "#111827", "muted": "#6b7280", "muted2": "#6b7280", "card": "#f9fafb", "line": "#e5e7eb", "th": "#f1f5f9", "th_ink": "#111827", "alerta": "#b91c1c", "bar": "#cbd5e1", "bar_alto": "#334155"},
    "ejecutivo": {"nombre": "Ejecutivo oscuro", "pri": "#d4a64a", "bg": "#0f1b2d", "ink": "#e7edf5", "muted": "#9fb0c7", "muted2": "#8a9bb3", "card": "#16263d", "line": "#26395a", "th": "#1d3150", "th_ink": "#e7edf5", "alerta": "#f59e5b", "bar": "#3c5a85", "bar_alto": "#d4a64a"},
}
LAMINAS = ("resumen", "compacto", "tipos", "detallado")
FILAS_POR_LAMINA = 13
e = lambda t: html.escape(str(t if t is not None else ""))


def _num(v, cero="–"):
    return f'<span class="cero">{cero}</span>' if not v else e(v)


def _porc(v, umbral=60):
    if v is None:
        return '<span class="cero">–</span>'
    return f'<span class="{"naranja" if v < umbral else ""}">{v}%</span>'


def _item(t: str, negrita: bool = True) -> str:
    t = e(t)
    if negrita and ":" in t[:40]:
        a, b = t.split(":", 1)
        return f"<li><b>{a}:</b>{b}</li>"
    return f"<li>{t}</li>"


def _grafica_flujo(dias, alto_max: int = 168, ancho: int = 760) -> str:
    """Entraron y se resolvieron (dos barras por dia) y abiertos al cierre (linea, eje derecho)."""
    if not dias:
        return ""
    W, H, L, R, T, B = ancho, max(110, int(alto_max)), 30, 34, 22, 24   # ancho de su columna; el alto, segun el espacio libre
    n = len(dias); paso = (W - L - R) / n
    max_b = max([1] + [x["entraron"] for x in dias] + [x["resueltos"] for x in dias])
    max_l = max([1] + [x["tickets"] for x in dias])
    def tope(v):
        for m in (5, 10, 20, 25, 40, 50, 60, 80, 100, 150, 200, 300, 500, 1000):
            if v <= m: return m
        return v
    mb, ml = tope(max_b), tope(max_l)
    alto = H - T - B
    yb = lambda v: T + alto - v / mb * alto
    yl = lambda v: T + alto - v / ml * alto
    cx = lambda i: L + paso * i + paso / 2
    w = min(22, paso * 0.3)
    s = []
    for k in range(5):
        v = mb * k / 4; y = yb(v)
        s.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="var(--line)" stroke-opacity=".5"/>'
                 f'<text x="{L-6}" y="{y+3.5:.1f}" text-anchor="end" class="g-eje">{v:g}</text>'
                 f'<text x="{W-R+6}" y="{yl(ml*k/4)+3.5:.1f}" class="g-eje" fill="var(--pri)">{ml*k/4:g}</text>')
    for i, x in enumerate(dias):
        for j, (v, cls) in enumerate(((x["entraron"], "g-entra"), (x["resueltos"], "g-sale"))):
            xx = cx(i) - w - 1 + j * (w + 2)
            s.append(f'<rect x="{xx:.1f}" y="{yb(v):.1f}" width="{w:.1f}" height="{H-B-yb(v):.1f}" rx="1.5" class="{cls}"/>')
        s.append(f'<text x="{cx(i):.1f}" y="{H-B+14}" text-anchor="middle" class="g-eje">{e(x["etiqueta"])}</text>')
    pts = " ".join(f"{cx(i):.1f},{yl(x['tickets']):.1f}" for i, x in enumerate(dias))
    s.append(f'<polyline points="{pts}" fill="none" stroke="var(--pri)" stroke-width="2.5" stroke-linejoin="round"/>')
    for i, x in enumerate(dias):
        s.append(f'<circle cx="{cx(i):.1f}" cy="{yl(x["tickets"]):.1f}" r="3.5" fill="var(--pri)"/>'
                 f'<text x="{cx(i):.1f}" y="{yl(x["tickets"])-7:.1f}" text-anchor="middle" class="g-num">{x["tickets"]}</text>')
    ley = ('<div class="g-ley"><span><i class="g-entra"></i>Entraron en el día</span><span><i class="g-sale"></i>Se resolvieron en el día</span>'
           '<span><i class="g-linea"></i>Abiertos al cierre (eje derecho)</span></div>')
    return f'<svg class="g-flujo" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">{"".join(s)}</svg>{ley}'


def _lamina_resumen(d, op) -> str:
    k = d["kpis"]
    est = (op.get("estatus") or "").strip()
    hal = [h for h in op.get("hallazgos") or [] if h.strip()]
    acc = [a for a in op.get("acciones") or [] if a.strip()]
    pr = k["pct_resueltos"]
    kpi = lambda v, t, alerta=False: f'<div class="kpi{" alerta" if alerta else ""}"><b>{v}</b><small>{e(t)}</small></div>'
    kpis = (kpi(k["total"], "Tickets totales") + kpi(k["resueltos"], f"Resueltos ({pr}%)" if pr is not None else "Resueltos")
            + kpi(k["abiertos"], "Abiertos") + kpi(k["vencidos"], "Vencidos abiertos", k["vencidos"] > 0)
            + kpi(f'{k["sla_resp"]}%' if k["sla_resp"] is not None else "–", "SLA respuesta", (k["sla_resp"] or 100) < 60)
            + kpi(f'{k["sla_resol"]}%' if k["sla_resol"] is not None else "–", "SLA resolución", (k["sla_resol"] or 100) < 60))
    fila = lambda u, cls="": (f'<tr class="{cls}"><td>{e(u["unidad"])}{"¹" if u["unidad"] == "Otros" else ""}</td><td>{u["tickets"]}</td><td>{u["resueltos"]}</td>'
                              f'<td>{u["abiertos"]}</td><td class="{"naranja" if u["vencidos"] else ""}">{_num(u["vencidos"])}</td><td>{_num(u["s1"])}</td>'
                              f'<td>{_porc(u["sla_resp"])}</td><td>{_porc(u["sla_resol"])}</td></tr>')
    tabla = "".join(fila(u) for u in d["unidades"]) + fila(d["unidades_total"], "total")
    dias = d["por_dia"]
    mx = max([x["tickets"] for x in dias] or [0]) or 1
    dos = sorted((x["tickets"] for x in dias), reverse=True)[:2]
    umbral_alto = dos[-1] if dos and dos[-1] > 0 else mx + 1
    barras = "".join(f'<div class="{"alto" if x["tickets"] >= umbral_alto else ""}"><span>{x["tickets"] or ""}</span><i style="height:{max(2, round(x["tickets"] / mx * 100))}%"></i></div>' for x in dias)
    ejes = "".join(f"<span>{e(x['etiqueta'])}</span>" for x in dias)
    if (op.get("grafica") or "flujo") == "abiertos":
        grafica = f'<p class="mini">Tickets abiertos al cierre de cada día</p><div class="barras">{barras}</div><div class="ejes">{ejes}</div>'
    else:
        # La grafica va debajo de la tabla (en su columna) y usa el alto que queda ahi
        alto_tabla = 30 + 29 * (len(d["unidades"]) + 1)
        con_barra = (op.get("tema") or "verus") in ("verus", "avalanz")
        libre = 720 - (86 if con_barra else 38) - 28 - 58 - (36 if est else 0) - 92 - alto_tabla - 30 - 24 - 20   # 20: aire entre la leyenda y la nota al pie
        grafica = f'<p class="mini">Entradas, salidas y abiertos al cierre de cada día</p>{_grafica_flujo(dias, libre, 760 if (hal or acc) else 1200)}'
    lateral = ""
    if hal:
        lateral += f'<div class="caja"><h3>Hallazgos</h3><ul>{"".join(_item(h) for h in hal)}</ul></div>'
    if acc:
        lateral += f'<div class="caja acc"><h3>Acciones</h3><ul>{"".join(_item(a, False) for a in acc)}</ul></div>'
    otros = f'¹ Otros: {", ".join(e(o) for o in d["otros"])} · ' if d["otros"] else ""
    return f'''<section class="slide">
  <h2 class="s-titulo">{e(op.get("titulo") or "Mesa de Ayuda")} | {e(d["periodo"]["titulo"])}</h2>
  {f'<p class="s-estatus">Estatus: {e(est)}</p>' if est else ''}
  <div class="kpis">{kpis}</div>
  <div class="cols{' sin-lateral' if not lateral else ''}">
    <div>
      <table><thead><tr><th>Unidad</th><th>Tickets</th><th>Resueltos</th><th>Abiertos</th><th>Vencidos</th><th>S1</th><th>SLA resp.</th><th>SLA resol.</th></tr></thead>
      <tbody>{tabla}</tbody></table>
      {grafica}
    </div>
    {f'<div>{lateral}</div>' if lateral else ''}
  </div>
  <span class="pie">{otros}Vencidos: abiertos que ya pasaron su SLA de resolución · SLA respuesta: entre los tickets que ya tuvieron respuesta</span>
</section>'''


def _colgroup(etiquetas: List[str], primera: int) -> str:
    """Ancho de cada columna proporcional a su palabra mas larga, para que los encabezados
    solo se partan entre palabras y nunca a la mitad de una."""
    pesos = [primera] + [max(4, max((len(w) for w in str(x).split()), default=4)) + 2 for x in etiquetas]
    total = sum(pesos)
    return "<colgroup>" + "".join(f'<col style="width:{p / total * 100:.2f}%">' for p in pesos) + "</colgroup>"


def _trozos(lista, n):
    return [lista[i:i + n] for i in range(0, len(lista), n)] or [[]]


def _lamina_compacto(d, op) -> List[str]:
    c = d["compacto"]
    cols, tot = list(c["columnas"]), list(c["totales"])
    filas_src = c["filas"]
    # Mas de 12 columnas no caben en la lamina: las 11 mayores van solas y el resto se suma en "Otros"
    if len(cols) > 12:
        resto = list(range(11, len(cols)))
        cols = cols[:11] + ["Otros"]
        tot = tot[:11] + [sum(tot[j] for j in resto)]
        filas_src = [{**f, "celdas": f["celdas"][:11] + [sum(f["celdas"][j] for j in resto)]} for f in c["filas"]]
    top = sorted(tot, reverse=True)[:3]
    corte = top[-1] if top else 1
    cab = "".join(f'<th class="{"top" if t >= corte and t > 0 else ""}">{e(col)}</th>' for col, t in zip(cols, tot))
    paginas = _trozos(filas_src, FILAS_POR_LAMINA)
    salida = []
    for p, filas in enumerate(paginas):
        cuerpo = "".join(
            f'<tr><td>{e(f["empresa"])}</td>{"".join(f"<td>{_num(v)}</td>" for v in f["celdas"])}'
            f'<td><b>{f["total"]}</b></td><td>{_num(f["abiertos"])}</td><td class="naranja">{_num(f["vencidos"])}</td></tr>' for f in filas)
        if p == len(paginas) - 1:
            cuerpo += (f'<tr class="total"><td>Total</td>{"".join(f"<td>{v}</td>" for v in tot)}<td>{sum(tot)}</td>'
                       f'<td>{sum(f["abiertos"] for f in c["filas"])}</td><td class="naranja">{sum(f["vencidos"] for f in c["filas"])}</td></tr>')
        sigue = " (continúa)" if p < len(paginas) - 1 else ""
        salida.append(f'''<section class="slide">
  <h2 class="s-titulo">Detalle por empresa y módulo{sigue}</h2>
  <table class="ancha">{_colgroup(cols + ["Total", "Abiertos", "Vencidos"], max(17, round(max((len(w) for f in filas_src for w in f["empresa"].split()), default=10) * 1.35) + 2))}<thead><tr><th>Empresa</th>{cab}<th>Total</th><th>Abiertos</th><th>Vencidos</th></tr></thead><tbody>{cuerpo}</tbody></table>
  <span class="pie">Accesos = Control de accesos + Permisos de acceso · TOTVS por módulo; los otros sistemas en una columna · Resaltados: los 3 con más tickets</span>
</section>''')
    return salida


def _lamina_tipos(d, op) -> str:
    filas = d.get("por_tipo") or []
    medidos = [f for f in filas if f["tipo"] != "control_cambio"]
    cdc = next((f for f in filas if f["tipo"] == "control_cambio"), None)
    fila = lambda f, cls="": (f'<tr class="{cls}"><td>{e(f["nombre"])}</td><td>{f["tickets"]}</td><td>{f["resueltos"]}</td>'
                              f'<td>{f["abiertos"]}</td><td class="{"naranja" if f["vencidos"] else ""}">{_num(f["vencidos"])}</td></tr>')
    tot = {"nombre": "Total del reporte", **{k: sum(f[k] for f in medidos) for k in ("tickets", "resueltos", "abiertos", "vencidos")}}
    cuerpo = "".join(fila(f) for f in medidos) + fila(tot, "total")
    if cdc:
        cuerpo += (f'<tr class="aparte"><td>{e(cdc["nombre"])}¹</td><td>{cdc["tickets"]}</td><td>{cdc["resueltos"]}</td>'
                   f'<td>{cdc["abiertos"]}</td><td>{_num(cdc["vencidos"])}</td></tr>')
    nota = ('<div class="caja nota"><h3>¹ Controles de cambio</h3><p>Se muestran solo como referencia: <b>no se incluyen en los indicadores de este reporte</b>, '
            'porque siguen su propio flujo (solicitud, dictamen, priorización, desarrollo, pruebas y liberación) y se miden por etapas, '
            'no con el SLA de respuesta y resolución de la Mesa de Ayuda.</p></div>') if cdc and cdc["tickets"] else ""
    return f'''<section class="slide">
  <h2 class="s-titulo">Tickets por tipo</h2>
  <div class="cols" style="grid-template-columns:1.25fr 1fr;align-items:start">
    <table class="tipos"><thead><tr><th>Tipo</th><th>Tickets</th><th>Resueltos</th><th>Abiertos</th><th>Vencidos</th></tr></thead><tbody>{cuerpo}</tbody></table>
    <div>{nota}</div>
  </div>
  <span class="pie">Periodo: {e(d["periodo"]["titulo"])} · Los indicadores de las demás láminas cuentan incidentes y solicitudes de acceso</span>
</section>'''


def _lamina_detallado(d, op) -> List[str]:
    emps = d["detallado"]["empresas"]
    filas = []
    for s in d["detallado"]["sistemas"]:
        filas.append(("sis", s))
        filas += [("mod", m) for m in s["modulos"]]
    cab = "".join(f"<th>{e(x)}</th>" for x in emps)
    salida = []
    # Paginas sin encabezados huerfanos: un sistema nunca queda solo al final de una lamina
    paginas, actual = [], []
    for fila in filas:
        lleno = len(actual) >= FILAS_POR_LAMINA or (fila[0] == "sis" and len(actual) >= FILAS_POR_LAMINA - 1)
        if lleno and actual:
            paginas.append(actual); actual = []
        actual.append(fila)
    paginas.append(actual)
    for p, trozo in enumerate(paginas):
        cuerpo = ""
        for tipo, x in trozo:
            if tipo == "sis":
                cuerpo += f'<tr class="grupo"><td colspan="{len(emps) + 4}">{e(x["sistema"])} · {x["total"]}</td></tr>'
            else:
                cuerpo += (f'<tr><td class="sangria">{e(x["modulo"])}</td>{"".join(f"<td>{_num(v)}</td>" for v in x["por_empresa"])}'
                           f'<td><b>{x["total"]}</b></td><td>{_num(x["abiertos"])}</td><td class="naranja">{_num(x["vencidos"])}</td></tr>')
        sigue = " (continúa)" if p < len(paginas) - 1 else ""
        salida.append(f'''<section class="slide">
  <h2 class="s-titulo">Detalle por sistema y módulo{sigue}</h2>
  <table class="ancha">{_colgroup(emps + ["Total", "Abiertos", "Vencidos"], 22)}<thead><tr><th>Sistema / módulo</th>{cab}<th>Total</th><th>Abiertos</th><th>Vencidos</th></tr></thead><tbody>{cuerpo}</tbody></table>
  <span class="pie">Todos los módulos, sin agrupar · Vencidos: abiertos que ya pasaron su SLA de resolución</span>
</section>''')
    return salida


def _completar(t: Dict[str, Any]) -> Dict[str, Any]:
    """Valores por defecto de cada parte de la lamina, a partir de los colores base del tema."""
    base = {"titulo": t["muted"], "linea_titulo": t["pri"], "estatus": t["pri"], "head_bg": t["th"], "head_ink": t["th_ink"],
            "celda": t["card"], "total_bg": t["th"], "total_ink": t["ink"], "top_bg": t["pri"], "top_ink": "#ffffff",
            "grupo_bg": t["th"], "grupo_ink": t["ink"], "kpi_num": t["ink"], "hero_bg": t["card"], "hero_ink": t["ink"],
            "hero_sub": t["muted2"], "hal_bg": t["card"], "hal_line": t["line"], "acc_bg": t["card"], "acc_line": t["line"],
            "fuente": "Inter,'Segoe UI','Noto Sans','DejaVu Sans',Arial,sans-serif"}
    return {**base, **t}


def _incrustado(nombre: str) -> str:
    import os
    try:
        return open(os.path.join(os.path.dirname(__file__), nombre)).read().strip()
    except OSError:
        return ""


def _barra_verus() -> str:
    """Barra degradada con el logotipo VERUS (tomada de la presentacion de Verus)."""
    import os
    ruta = os.path.join(os.path.dirname(__file__), "barra_verus.b64")
    try:
        return open(ruta).read().strip()
    except OSError:
        return ""


def armar_html(d: Dict[str, Any], op: Dict[str, Any]) -> str:
    tema = op.get("tema") or "verus"
    tema = "verus" if tema == "avalanz" else tema          # el tema "Avalanz verde" ahora se llama Verus
    t = _completar(dict(TEMAS.get(tema, TEMAS["verus"])))
    barra = _barra_verus() if t.pop("barra", False) else ""
    mont = _incrustado("montserrat600.b64")
    acento = (op.get("acento") or "").strip()
    if len(acento) == 7 and acento.startswith("#") and all(ch in "0123456789abcdefABCDEF" for ch in acento[1:]):
        if t.get("titulo") == t["pri"]: t["titulo"] = acento
        for k in ("head_bg", "hero_bg", "kpi_num", "total_ink", "grupo_ink", "bar_alto"):
            if t.get(k) == t["pri"]: t[k] = acento
        if t.get("linea_titulo") == t["pri"] or "linear-gradient" in t.get("linea_titulo", ""):
            t["linea_titulo"] = acento if "linear-gradient" not in t.get("linea_titulo", "") or acento.lower() == "#065744" else f"linear-gradient(90deg,{acento}55,{acento})"
        t["pri"] = acento
    laminas = [l for l in (op.get("laminas") or list(LAMINAS)) if l in LAMINAS]
    partes = []
    for l in laminas:
        if l == "resumen":
            partes.append(_lamina_resumen(d, op))
        elif l == "compacto":
            partes += _lamina_compacto(d, op)
        elif l == "tipos":
            partes.append(_lamina_tipos(d, op))
        elif l == "detallado":
            partes += _lamina_detallado(d, op)
    font_css = ("@font-face{font-family:Montserrat;font-weight:600;font-style:normal;src:url(data:font/woff2;base64," + mont + ") format('woff2')}") if mont else ""
    v = ";".join(f"--{k.replace('_', '-')}:{val}" for k, val in t.items() if k != "nombre")
    css_barra = (f".slide{{padding-bottom:84px}} .slide::after{{content:'';position:absolute;left:53px;top:648px;width:1155px;height:46px;"
                 f"background:url(data:image/png;base64,{barra}) center/100% 100% no-repeat}} .pie{{bottom:78px}}") if barra else ""
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{e(op.get("titulo") or "Mesa de Ayuda")} | {e(d["periodo"]["titulo"])}</title>
<style>
:root{{{v}}}
{font_css}
@page{{size:1280px 720px;margin:0}}
*{{box-sizing:border-box}}
html,body{{margin:0;background:#9aa4b2}}
body{{font-family:var(--fuente);color:var(--ink)}}
.slide{{width:1280px;height:720px;background:var(--bg);color:var(--ink);padding:28px 40px 34px;position:relative;overflow:hidden;display:flex;flex-direction:column;margin:0 auto 24px;page-break-after:always;break-after:page}}
@media print{{html,body{{background:none}}.slide{{margin:0}}}}
.s-titulo{{font:600 34px Montserrat,Inter,Arial,sans-serif;color:var(--titulo);margin:0 0 14px;padding-bottom:9px;width:78%;position:relative}}.s-titulo::after{{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;border-radius:2px;background:var(--linea-titulo)}}
.s-estatus{{text-align:center;font-weight:700;font-size:21px;color:var(--estatus);margin:0 0 14px}}
.kpis{{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:16px}}
.kpi{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 16px}}
.kpi b{{display:block;font-size:30px;line-height:1.15;color:var(--kpi-num)}} .kpi small{{color:var(--muted2);font-size:14px}}.kpi:first-child{{background:var(--hero-bg);border-color:var(--hero-bg)}} .kpi:first-child b{{color:var(--hero-ink)}} .kpi:first-child small{{color:var(--hero-sub)}}
.kpi.alerta b{{color:var(--alerta)}} .kpi:first-child.alerta b{{color:#ffd2bd}}
.cols{{display:grid;grid-template-columns:1.6fr 1fr;gap:24px;align-items:start}} .cols.sin-lateral{{grid-template-columns:1fr}}
table{{width:100%;border-collapse:collapse;font-size:14.5px}} table.ancha{{font-size:13px;table-layout:fixed}}
table.ancha th{{white-space:normal;word-break:normal;overflow-wrap:normal;line-height:1.15;font-size:11.5px;padding:6px 3px}}
th{{background:var(--head-bg);color:var(--head-ink);font-weight:600;padding:7px 6px;border:1px solid var(--line);text-align:center}}
th:first-child,td:first-child{{text-align:left}}
td{{padding:6px;border:1px solid var(--line);text-align:center;background:var(--celda)}}
tr.total td{{font-weight:700;background:var(--total-bg);color:var(--total-ink)}} tr.grupo td{{font-weight:700;background:var(--grupo-bg);color:var(--grupo-ink);text-align:left}}
table.ancha td{{padding:9px 6px}} td.sangria{{padding-left:22px}} th.top{{background:var(--top-bg);color:var(--top-ink)}}
.naranja{{color:var(--alerta);font-weight:600}} .cero{{color:var(--muted2);font-weight:400}}
.caja{{background:var(--hal-bg);border:1px solid var(--hal-line);border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:15px}}
.caja h3{{margin:0 0 6px;font-size:18px;color:var(--pri)}} .caja.acc{{background:var(--acc-bg);border-color:var(--acc-line)}} .caja.acc h3{{color:var(--alerta)}}
.caja ul{{margin:0;padding-left:18px}} .caja li{{margin-bottom:4px}}
.mini{{font-size:13px;font-weight:700;margin:12px 0 4px}}
.g-flujo{{width:100%;height:auto;display:block}} .g-eje{{font-size:10px;fill:var(--muted2)}} .g-num{{font-size:10.5px;font-weight:700;fill:var(--pri)}}
.g-entra{{fill:var(--line);background:var(--line)}} .g-sale{{fill:var(--top-bg);background:var(--top-bg)}}
.g-ley{{display:flex;gap:18px;font-size:11.5px;color:var(--muted2);margin-top:2px}} .g-ley span{{display:flex;align-items:center;gap:6px}}
.g-ley i{{display:inline-block;width:12px;height:10px;border-radius:2px}} .g-ley i.g-linea{{width:16px;height:3px;background:var(--pri)}}
table.tipos{{font-size:17px}} table.tipos td,table.tipos th{{padding:12px 10px}} tr.aparte td{{color:var(--muted2);font-style:italic;background:var(--bg);border-top:2px dashed var(--line)}}
.caja.nota p{{margin:0;line-height:1.5}}
.barras{{display:flex;align-items:flex-end;gap:2%;height:120px;padding:0 3%;border-bottom:1px solid var(--line)}}
.barras div{{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:12px;font-weight:700}}
.barras i{{width:66%;background:var(--bar);border-radius:2px 2px 0 0}} .barras .alto i{{background:var(--bar-alto)}}
.ejes{{display:flex;gap:2%;padding:4px 3% 0;font-size:11px;color:var(--muted2)}} .ejes span{{flex:1;text-align:center}}
.pie{{position:absolute;left:40px;bottom:12px;font-size:11px;color:var(--muted2)}}
{css_barra}
</style></head><body>{"".join(partes) or '<section class="slide"><h2 class="s-titulo">Sin láminas seleccionadas</h2></section>'}</body></html>'''
