# ----------------------------------------------------------------------
# Experimento: vocabulario del negocio para orientar la busqueda al tema
# Si la pregunta contiene palabras de un tema ("empleado" -> nomina), los
# fragmentos de ese tema reciben un empujon (no es un filtro). Compara un
# vocabulario semilla, uno automatico (palabras caracteristicas de los
# manuales de cada tema) y ambos, con distintas fuerzas y normalizando o
# no la pregunta. Base: profundidad 20, habla 0.3 (produccion actual).
# No toca produccion.
# ----------------------------------------------------------------------
import json, math, re, statistics, unicodedata
from collections import Counter, defaultdict
from itertools import product
from pathlib import Path, PurePosixPath

import openpyxl

from app.domain.models import BlockKind
from evaluation.corpus import build_corpus
from evaluation.questions import load_questions
from evaluation.relevance import is_relevant
from evaluation.retrieval_benchmark import Bm25Retriever, OnnxRetriever, tokenize

V2 = Path("evaluation/datasets/preguntas-v2.xlsx")
NUEVAS = [
    ("P31", "Como doy de alta un empleado?", "proceso", "totvs-nomina", "manual-autocapacitacion-nomina-v2.pdf", "21"),
    ("P32", "como doy de alta un empleado?", "proceso", "totvs-nomina", "manual-autocapacitacion-nomina-v2.pdf", "21"),
    ("P33", "como creo un empleado en nomina?", "proceso", "totvs-nomina", "manual-autocapacitacion-nomina-v2.pdf", "21"),
    ("P34", "Porque no puedo cancelar una Factura?", "proceso", "totvs-ventas-facturacion", "manual-autocapacitacion-ventas-facturacion-v2.pdf", "20"),
]
SEMILLA = {
    "totvs-nomina": ["empleado", "trabajador", "colaborador", "sueldo", "salario", "finiquito", "aguinaldo", "vacaciones",
                     "imss", "infonavit", "fonacot", "quincena", "nomina", "incidencia", "prestaciones"],
    "totvs-activo-fijo": ["activo", "depreciacion", "bien", "bienes"],
    "portal-web-proveedores": ["proveedor", "portal", "web de proveedores"],
    "totvs-ventas-facturacion": ["factura", "cfdi", "timbrar", "timbro", "timbrado", "cliente", "remision", "nota de credito"],
    "totvs-stock-costos": ["stock", "inventario", "almacen", "existencia", "costo", "producto", "kardex"],
    "totvs-contabilidad": ["contabilidad", "poliza", "asiento", "cuenta contable", "balanza", "cierre contable"],
    "totvs-financiero": ["banco", "saldo", "cuentas por pagar", "cuentas por cobrar", "cobranza", "pago", "cheque", "conciliacion"],
    "totvs-proyectos": ["proyecto"],
    "crm-odoo-dyce": ["crm", "odoo", "lead", "oportunidad", "cotizacion", "vendedor"],
    "mesa-de-ayuda": ["ticket", "mesa de ayuda", "incidente", "sla", "especialista"],
    "totvs-prueba-integral": ["prueba integral", "e2e"],
}
VACIAS = set("para como este esta esto estos estas sobre entre cuando donde desde hasta cada todo todos todas tiene tienen "
             "puede pueden debe deben sera seran esta estan hace hacer solo tambien mismo misma otra otro otras otros "
             "dentro aqui pero porque cual cuales siempre manual sesion capacitacion seccion pagina sistema totvs".split())

def norm(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()).strip()
def raiz(p):  # plural simple: empleados -> empleado, bienes -> bien
    return p[:-2] if len(p) > 5 and p.endswith("es") else p[:-1] if len(p) > 4 and p.endswith("s") else p

print("Construyendo el corpus ...", flush=True)
corpus = build_corpus(Path("/fuentes"))
tema_de = [PurePosixPath(d.relative_path).parent.name for d, _ in corpus]
es_habla = [c.kind == BlockKind.SPEECH for _, c in corpus]

# ---------------- Vocabulario automatico (solo manuales) ----------------
cuenta = defaultdict(Counter); total = Counter()
for (d, c), tema, habla in zip(corpus, tema_de, es_habla):
    if habla: continue
    for tok in {raiz(t) for t in tokenize(c.text)}:
        if len(tok) < 4 or tok.isdigit() or tok in VACIAS: continue
        cuenta[tema][tok] += 1; total[tok] += 1
AUTO = {}
for tema, c in cuenta.items():
    puntaje = {t: (n / total[t]) * math.log(1 + n) for t, n in c.items() if n >= 4 and n / total[t] >= 0.6}
    AUTO[tema] = [t for t, _ in sorted(puntaje.items(), key=lambda x: -x[1])[:15]]

def temas_de(pregunta, vocab):
    q = " " + " ".join(raiz(t) for t in norm(pregunta).split()) + " "
    return {tema for tema, terminos in vocab.items()
            if any(f" {' '.join(raiz(x) for x in norm(t).split())} " in q for t in terminos)}

# ---------------- Preguntas v2 + nuevas ----------------
wb = openpyxl.load_workbook(V2); ws = wb["Preguntas"]
existentes = {str(f[0].value) for f in ws.iter_rows(min_row=2)}
for fila in NUEVAS:
    if fila[0] not in existentes: ws.append(list(fila) + [""])
wb.save(V2)
questions = load_questions(V2)
answerable = [q for q in questions if q.answerable]
print(f"Preguntas: con_respuesta={len(answerable)} | sin_respuesta={len(questions) - len(answerable)}", flush=True)

# ---------------- Rankings (pregunta tal cual y normalizada) ----------------
print("Vectorizando el corpus (varios minutos) ...", flush=True)
textos = [c.embedding_text for _, c in corpus]
dense, lexical = OnnxRetriever("model.onnx"), Bm25Retriever()
dense.index(textos); lexical.index(textos)
def normalizada(t): return t.strip(" ¿?¡!.").lower()
rank = {}
for q in questions:
    for modo, texto in (("tal_cual", q.text), ("normalizada", normalizada(q.text))):
        rank[(q.id, modo)] = (dense.search(texto, 20), lexical.search(texto, 20))

def fusion(qid, modo, temas, fuerza, kappa=60, habla=0.3):
    f = {}
    for ranking in rank[(qid, modo)]:
        for pos, (i, _) in enumerate(ranking, start=1):
            f[i] = f.get(i, 0.0) + 1.0 / (kappa + pos)
    for i in f:
        if es_habla[i]: f[i] *= habla
        if tema_de[i] in temas: f[i] *= fuerza
    return [i for i, _ in sorted(f.items(), key=lambda x: -x[1])[:10]]

VOCABS = {"ninguno": {}, "semilla": SEMILLA, "automatico": AUTO,
          "ambos": {t: SEMILLA.get(t, []) + AUTO.get(t, []) for t in set(SEMILLA) | set(AUTO)}}
resultados = []
for (nombre, vocab), fuerza, modo in product(VOCABS.items(), (1.3, 1.6, 2.0), ("tal_cual", "normalizada")):
    if nombre == "ninguno" and fuerza != 1.3: continue
    ranks = {}
    for q in answerable:
        top = fusion(q.id, modo, temas_de(q.text, vocab) if vocab else set(), fuerza if vocab else 1.0)
        rel = [r for r, i in enumerate(top, start=1) if is_relevant(q, *corpus[i])]
        ranks[q.id] = rel[0] if rel else None
    v = list(ranks.values()); m = lambda x: round(statistics.mean(x), 3)
    resultados.append({"vocab": nombre, "fuerza": fuerza if vocab else "-", "modo": modo, "ranks": ranks,
                       "r1": m([1.0 if r == 1 else 0.0 for r in v]), "r3": m([1.0 if r and r <= 3 else 0.0 for r in v]),
                       "r5": m([1.0 if r and r <= 5 else 0.0 for r in v]), "mrr": m([1 / r if r else 0.0 for r in v])})
resultados.sort(key=lambda r: (-r["mrr"], -r["r1"], -r["r5"]))
base = next(r for r in resultados if r["vocab"] == "ninguno" and r["modo"] == "tal_cual")
print(f"\n== COMBINACIONES (con_respuesta={len(answerable)}; base = produccion actual) ==")
print(f"  {'vocabulario':11s} {'fuerza':>6} {'pregunta':11s} | {'R@1':>5} {'R@3':>5} {'R@5':>5} {'MRR':>6}")
for r in resultados[:14]:
    print(f"  {r['vocab']:11s} {str(r['fuerza']):>6} {r['modo']:11s} | {r['r1']:>5} {r['r3']:>5} {r['r5']:>5} {r['mrr']:>6}"
          + ("   <- PRODUCCION" if r is base else ""))
if base not in resultados[:14]:
    print(f"  {'ninguno':11s} {'-':>6} {'tal_cual':11s} | {base['r1']:>5} {base['r3']:>5} {base['r5']:>5} {base['mrr']:>6}   <- PRODUCCION")

mejor = resultados[0]
print(f"\n== DETALLE: produccion vs mejor ({mejor['vocab']}, fuerza {mejor['fuerza']}, {mejor['modo']}) ==")
for q in answerable:
    a, b = base["ranks"][q.id], mejor["ranks"][q.id]
    marca = "  mejora" if (b or 99) < (a or 99) else "  EMPEORA" if (b or 99) > (a or 99) else ""
    if marca or q.id in ("P31", "P32", "P33", "P34"):
        print(f"  {q.id} {q.text[:45]:45s} produccion={str(a):>4} mejor={str(b):>4}{marca}")

print("\n== BORRADOR DEL VOCABULARIO AUTOMATICO (para revisar) ==")
for tema in sorted(AUTO):
    print(f"  {tema}: {', '.join(AUTO[tema])}")
Path("evaluation/results/vocabulario-borrador.yaml").write_text(
    "# Borrador automatico: palabras caracteristicas de los manuales de cada tema. Revisar y completar.\n" +
    "".join(f"{t}:\n" + "".join(f"  - {p}\n" for p in AUTO[t]) for t in sorted(AUTO)), encoding="utf-8")
Path("evaluation/results/calibracion-vocabulario.json").write_text(json.dumps(
    [{k: v for k, v in r.items()} for r in resultados], ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nTEST: mejor={mejor['vocab']} fuerza={mejor['fuerza']} {mejor['modo']} R@1={mejor['r1']} R@5={mejor['r5']} MRR={mejor['mrr']} | "
      f"produccion: R@1={base['r1']} R@5={base['r5']} MRR={base['mrr']}")
