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
FAMILIAS = {"CORP": "Corporativo", "DYCE": "Dyce", "SPPE": "Sppel", "AVAL": "Avalanz", "CNCI": "CNCI",
            "TODI": "Todito", "VNTA": "Vanta Media", "ZIGN": "Zignia", "PROM": "Promotora"}
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
               "septiembre", "octubre", "noviembre", "diciembre"]
UNIDADES_SOLAS = 4          # las 4 familias con mas tickets van solas; el resto en "Otros"


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
             desde: date, hasta: date, now: Optional[datetime] = None) -> Dict[str, Any]:
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

    # Tickets por dia (dias habiles del rango, mas cualquier dia con tickets)
    por_dia = defaultdict(int)
    for i in tickets:
        por_dia[i.created_at.astimezone(TZ).date()] += 1
    dias, d = [], desde
    while d <= hasta:
        if d.weekday() < 5 or por_dia.get(d):
            dias.append({"fecha": d.isoformat(), "etiqueta": f"{d.day} {MESES[d.month - 1]}", "tickets": por_dia.get(d, 0)})
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


def titulo_periodo(desde: date, hasta: date) -> str:
    if desde.year == hasta.year and desde.month == hasta.month:
        return f"{desde.day} al {hasta.day} {MESES_LARGO[desde.month - 1]} {desde.year}"
    if desde.year == hasta.year:
        return f"{desde.day} {MESES_LARGO[desde.month - 1]} al {hasta.day} {MESES_LARGO[hasta.month - 1]} {desde.year}"
    return f"{desde.day} {MESES_LARGO[desde.month - 1]} {desde.year} al {hasta.day} {MESES_LARGO[hasta.month - 1]} {hasta.year}"


# ───────────────────────── Laminas (HTML 16:9) ─────────────────────────
TEMAS = {
    "avalanz":   {"nombre": "Avalanz verde", "pri": "#0a5c46", "bg": "#ffffff", "ink": "#1f2937", "muted": "#7c7c7c", "muted2": "#6b7280", "card": "#faf9f5", "line": "#d9d6cc", "th": "#e4e2dc", "th_ink": "#374151", "alerta": "#b4532a", "bar": "#7f9e86", "bar_alto": "#3f4a40"},
    "intranet":  {"nombre": "Azul intranet", "pri": "#1a4fa0", "bg": "#ffffff", "ink": "#0f2440", "muted": "#64748b", "muted2": "#64748b", "card": "#f8fafc", "line": "#d5dde8", "th": "#e7edf5", "th_ink": "#0f2440", "alerta": "#c2410c", "bar": "#8fb0dc", "bar_alto": "#1a4fa0"},
    "sobrio":    {"nombre": "Sobrio", "pri": "#334155", "bg": "#ffffff", "ink": "#111827", "muted": "#6b7280", "muted2": "#6b7280", "card": "#f9fafb", "line": "#e5e7eb", "th": "#f1f5f9", "th_ink": "#111827", "alerta": "#b91c1c", "bar": "#cbd5e1", "bar_alto": "#334155"},
    "ejecutivo": {"nombre": "Ejecutivo oscuro", "pri": "#d4a64a", "bg": "#0f1b2d", "ink": "#e7edf5", "muted": "#9fb0c7", "muted2": "#8a9bb3", "card": "#16263d", "line": "#26395a", "th": "#1d3150", "th_ink": "#e7edf5", "alerta": "#f59e5b", "bar": "#3c5a85", "bar_alto": "#d4a64a"},
}
LAMINAS = ("resumen", "compacto", "detallado")
FILAS_POR_LAMINA = 15
e = lambda t: html.escape(str(t if t is not None else ""))


def _num(v, cero="–"):
    return f'<span class="cero">{cero}</span>' if not v else e(v)


def _porc(v, umbral=60):
    if v is None:
        return '<span class="cero">–</span>'
    return f'<span class="{"naranja" if v < umbral else ""}">{v}%</span>'


def _item(t: str) -> str:
    t = e(t)
    if ":" in t[:40]:
        a, b = t.split(":", 1)
        return f"<li><b>{a}:</b>{b}</li>"
    return f"<li>{t}</li>"


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
    lateral = ""
    if hal:
        lateral += f'<div class="caja"><h3>Hallazgos</h3><ul>{"".join(_item(h) for h in hal)}</ul></div>'
    if acc:
        lateral += f'<div class="caja acc"><h3>Acciones</h3><ul>{"".join(_item(a) for a in acc)}</ul></div>'
    otros = f'¹ Otros: {", ".join(e(o) for o in d["otros"])} · ' if d["otros"] else ""
    return f'''<section class="slide">
  <h2 class="s-titulo">{e(op.get("titulo") or "Mesa de Ayuda")} | {e(d["periodo"]["titulo"])}</h2>
  {f'<p class="s-estatus">Estatus: {e(est)}</p>' if est else ''}
  <div class="kpis">{kpis}</div>
  <div class="cols{' sin-lateral' if not lateral else ''}">
    <div>
      <table><thead><tr><th>Unidad</th><th>Tickets</th><th>Resueltos</th><th>Abiertos</th><th>Vencidos</th><th>S1</th><th>SLA resp.</th><th>SLA resol.</th></tr></thead>
      <tbody>{tabla}</tbody></table>
      <p class="mini">Tickets creados por día</p>
      <div class="barras">{barras}</div><div class="ejes">{ejes}</div>
    </div>
    {f'<div>{lateral}</div>' if lateral else ''}
  </div>
  <span class="pie">{otros}Vencidos: abiertos que ya pasaron su SLA de resolución · SLA respuesta: entre los tickets que ya tuvieron respuesta</span>
</section>'''


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
  <table class="ancha"><thead><tr><th>Empresa</th>{cab}<th>Total</th><th>Abiertos</th><th>Vencidos</th></tr></thead><tbody>{cuerpo}</tbody></table>
  <span class="pie">Accesos = Control de accesos + Permisos de acceso · TOTVS por módulo; los otros sistemas en una columna · Resaltados: los 3 con más tickets</span>
</section>''')
    return salida


def _lamina_detallado(d, op) -> List[str]:
    emps = d["detallado"]["empresas"]
    filas = []
    for s in d["detallado"]["sistemas"]:
        filas.append(("sis", s))
        filas += [("mod", m) for m in s["modulos"]]
    cab = "".join(f"<th>{e(x)}</th>" for x in emps)
    salida = []
    paginas = _trozos(filas, FILAS_POR_LAMINA)
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
  <table class="ancha"><thead><tr><th>Sistema / módulo</th>{cab}<th>Total</th><th>Abiertos</th><th>Vencidos</th></tr></thead><tbody>{cuerpo}</tbody></table>
  <span class="pie">Todos los módulos, sin agrupar · Vencidos: abiertos que ya pasaron su SLA de resolución</span>
</section>''')
    return salida


def armar_html(d: Dict[str, Any], op: Dict[str, Any]) -> str:
    t = dict(TEMAS.get(op.get("tema") or "avalanz", TEMAS["avalanz"]))
    acento = (op.get("acento") or "").strip()
    if len(acento) == 7 and acento.startswith("#") and all(ch in "0123456789abcdefABCDEF" for ch in acento[1:]):
        t["pri"] = acento
    laminas = [l for l in (op.get("laminas") or list(LAMINAS)) if l in LAMINAS]
    partes = []
    for l in laminas:
        if l == "resumen":
            partes.append(_lamina_resumen(d, op))
        elif l == "compacto":
            partes += _lamina_compacto(d, op)
        elif l == "detallado":
            partes += _lamina_detallado(d, op)
    v = ";".join(f"--{k.replace('_', '-')}:{val}" for k, val in t.items() if k != "nombre")
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{e(op.get("titulo") or "Mesa de Ayuda")} | {e(d["periodo"]["titulo"])}</title>
<style>
:root{{{v}}}
@page{{size:1280px 720px;margin:0}}
*{{box-sizing:border-box}}
html,body{{margin:0;background:#9aa4b2}}
body{{font-family:Inter,"Segoe UI","Noto Sans","DejaVu Sans",Arial,sans-serif;color:var(--ink)}}
.slide{{width:1280px;height:720px;background:var(--bg);color:var(--ink);padding:28px 40px 34px;position:relative;overflow:hidden;display:flex;flex-direction:column;margin:0 auto 24px;page-break-after:always;break-after:page}}
@media print{{html,body{{background:none}}.slide{{margin:0}}}}
.s-titulo{{font:800 34px Montserrat,Inter,"Noto Sans",Arial,sans-serif;color:var(--muted);margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid var(--pri);width:78%}}
.s-estatus{{text-align:center;font-weight:700;font-size:21px;color:var(--pri);margin:0 0 14px}}
.kpis{{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:16px}}
.kpi{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 16px}}
.kpi b{{display:block;font-size:30px;line-height:1.15}} .kpi small{{color:var(--muted2);font-size:14px}}
.kpi.alerta b{{color:var(--alerta)}}
.cols{{display:grid;grid-template-columns:1.6fr 1fr;gap:24px;flex:1;min-height:0}} .cols.sin-lateral{{grid-template-columns:1fr}}
table{{width:100%;border-collapse:collapse;font-size:14.5px}} table.ancha{{font-size:13px;table-layout:fixed}}
table.ancha th{{white-space:normal;word-break:break-word;line-height:1.15;font-size:12px}} table.ancha th:first-child{{width:150px}}
th{{background:var(--th);color:var(--th-ink);font-weight:600;padding:7px 6px;border:1px solid var(--line);text-align:center}}
th:first-child,td:first-child{{text-align:left}}
td{{padding:6px;border:1px solid var(--line);text-align:center;background:var(--card)}}
tr.total td{{font-weight:700;background:var(--th)}} tr.grupo td{{font-weight:700;background:var(--th);text-align:left}}
table.ancha td{{padding:9px 6px}} td.sangria{{padding-left:22px}} th.top{{background:var(--pri);color:#fff}}
.naranja{{color:var(--alerta);font-weight:600}} .cero{{color:var(--muted2);font-weight:400}}
.caja{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:15px}}
.caja h3{{margin:0 0 6px;font-size:18px;color:var(--pri)}} .caja.acc h3{{color:var(--alerta)}}
.caja ul{{margin:0;padding-left:18px}} .caja li{{margin-bottom:4px}}
.mini{{font-size:13px;font-weight:700;margin:12px 0 4px}}
.barras{{display:flex;align-items:flex-end;gap:2%;height:120px;padding:0 3%;border-bottom:1px solid var(--line)}}
.barras div{{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:12px;font-weight:700}}
.barras i{{width:66%;background:var(--bar);border-radius:2px 2px 0 0}} .barras .alto i{{background:var(--bar-alto)}}
.ejes{{display:flex;gap:2%;padding:4px 3% 0;font-size:11px;color:var(--muted2)}} .ejes span{{flex:1;text-align:center}}
.pie{{position:absolute;left:40px;bottom:12px;font-size:11px;color:var(--muted2)}}
</style></head><body>{"".join(partes) or '<section class="slide"><h2 class="s-titulo">Sin láminas seleccionadas</h2></section>'}</body></html>'''
