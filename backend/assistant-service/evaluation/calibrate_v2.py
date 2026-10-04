# ----------------------------------------------------------------------
# Calibracion del hibrido con el corpus ampliado (preguntas v2)
# 1. Construye preguntas-v2.xlsx a partir de v1: temas nuevos, preguntas de
#    manuales V1 retirados reetiquetadas a la V2 en PDF y preguntas nuevas.
# 2. Calcula una sola vez los 40 primeros de BM25 y e5 por pregunta y prueba
#    combinaciones de peso del habla, peso de prototipos y profundidad.
# 3. Mide la senal de confianza (coincidencias) con ventanas de 5 a 20.
# No toca produccion: solo mide.
# ----------------------------------------------------------------------
import json, re, statistics, unicodedata
from itertools import product
from pathlib import Path, PurePosixPath

import openpyxl

from app.domain.models import BlockKind
from evaluation.corpus import build_corpus
from evaluation.questions import load_questions
from evaluation.relevance import is_relevant
from evaluation.retrieval_benchmark import Bm25Retriever, OnnxRetriever

V1 = Path("evaluation/datasets/preguntas-v1.xlsx")
V2 = Path("evaluation/datasets/preguntas-v2.xlsx")
TEMAS = {"activo-fijo": "totvs-activo-fijo", "financiero": "totvs-financiero", "proyectos": "totvs-proyectos",
         "nomina": "totvs-nomina", "ventas-facturacion": "totvs-ventas-facturacion", "roles": "mesa-de-ayuda"}
RETIRADOS = {"manual-autocapacitacion-ventas-facturacion-v1.docx": "manual-autocapacitacion-ventas-facturacion-v2.pdf",
             "manual-autocapacitacion-crm-odoo-dyce-v1.docx": "manual-autocapacitacion-crm-odoo-dyce-v2.pdf"}
# P29: procedimiento de timbrado en 8.1 Generacion de factura (pagina 19 de Ventas V2)
NUEVAS = [
    ("P26", "¿Cómo veo mi stock?", "proceso", "totvs-stock-costos", "manual-autocapacitacion-stock-costos-v2.pdf", "15"),
    ("P27", "¿Dónde consulto un producto de stock?", "ubicacion", "totvs-stock-costos", "capacitacion-2026-09-08.transcripcion.docx", "22:03"),
    ("P28", "¿Cómo calculo la nómina?", "proceso", "totvs-nomina", "manual-autocapacitacion-nomina-v2.pdf", "12"),
    ("P29", "¿Cómo timbro una factura en TOTVS?", "proceso", "totvs-ventas-facturacion", "manual-autocapacitacion-ventas-facturacion-v2.pdf", "19"),
    ("P30", "¿Por qué me marca error al borrar una factura?", "proceso", "ninguno", "ninguno", ""),
]

def norm(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKD", str(t)).encode("ascii", "ignore").decode().lower()).strip()

print("Construyendo el corpus desde /fuentes ...", flush=True)
corpus = build_corpus(Path("/fuentes"))
print(f"  fragmentos={len(corpus)}", flush=True)

def paginas(archivo, condicion):
    return sorted({c.location.page for d, c in corpus
                   if PurePosixPath(d.relative_path).name == archivo and c.location.page and condicion(norm(c.context_header))})

# ---------------- 1. Preguntas v2 ----------------
wb = openpyxl.load_workbook(V1)
ws = wb["Preguntas"]
reporte = []
for fila in ws.iter_rows(min_row=2):
    qid, doc, ubic, tema = fila[0].value, fila[4].value, fila[5].value, fila[3].value
    if not qid or not str(qid).startswith("P"): continue
    if tema in TEMAS: fila[3].value = TEMAS[tema]
    if doc in RETIRADOS:
        nuevo = RETIRADOS[doc]; seccion = norm(ubic or "")
        pags = paginas(nuevo, lambda h: seccion and seccion in h)
        if not pags and seccion:
            clave = " ".join(seccion.split()[:3])
            pags = paginas(nuevo, lambda h: clave in h)
        if pags:
            fila[4].value, fila[5].value = nuevo, pags[0]
            reporte.append(f"  {qid}: {doc} [{ubic}] -> {nuevo} pagina {pags[0]}")
        else:
            reporte.append(f"  {qid}: REVISAR, no se encontro [{ubic}] en {nuevo} (se queda en la V1 retirada)")
for qid, texto, tipo, tema, doc, ubic in NUEVAS:
    ws.append([qid, texto, tipo, tema, doc, ubic, ""])
wb.save(V2)
print("\n== REETIQUETADO =="); print("\n".join(reporte) or "  (ninguna)")

questions = load_questions(V2)
answerable = [q for q in questions if q.answerable]
unanswerable = [q for q in questions if not q.answerable]
print(f"\nPreguntas v2: con_respuesta={len(answerable)} | sin_respuesta={len(unanswerable)}", flush=True)

# ---------------- 2. Rankings una sola vez ----------------
print("Vectorizando el corpus (varios minutos) ...", flush=True)
textos = [c.embedding_text for _, c in corpus]
dense, lexical = OnnxRetriever("model.onnx"), Bm25Retriever()
dense.index(textos); lexical.index(textos)
MAXD = 40
rank_d = {q.id: dense.search(q.text, MAXD) for q in questions}
rank_l = {q.id: lexical.search(q.text, MAXD) for q in questions}
es_habla = [c.kind == BlockKind.SPEECH for _, c in corpus]
es_proto = [PurePosixPath(d.relative_path).name.startswith("prototipo-") for d, _ in corpus]

def fusion(qid, depth, w_habla, w_proto, kappa=60):
    f = {}
    for ranking in (rank_d[qid][:depth], rank_l[qid][:depth]):
        for pos, (i, _) in enumerate(ranking, start=1):
            f[i] = f.get(i, 0.0) + 1.0 / (kappa + pos)
    for i in f:
        if es_habla[i]:
            f[i] *= w_habla * (w_proto if es_proto[i] else 1.0)
    return [i for i, _ in sorted(f.items(), key=lambda x: -x[1])[:10]]

def metricas(depth, w_habla, w_proto):
    ranks, habla5 = [], []
    for q in answerable:
        top = fusion(q.id, depth, w_habla, w_proto)
        rel = [r for r, i in enumerate(top, start=1) if is_relevant(q, *corpus[i])]
        ranks.append(rel[0] if rel else None)
        habla5.append(sum(es_habla[i] for i in top[:5]) / 5)
    m = lambda v: round(statistics.mean(v), 3)
    return {"r1": m([1.0 if r == 1 else 0.0 for r in ranks]), "r3": m([1.0 if r and r <= 3 else 0.0 for r in ranks]),
            "r5": m([1.0 if r and r <= 5 else 0.0 for r in ranks]), "mrr": m([1 / r if r else 0.0 for r in ranks]),
            "habla_top5": m(habla5), "ranks": dict(zip([q.id for q in answerable], ranks))}

resultados = []
for depth, w_habla, w_proto in product((20, 40), (0.5, 0.3, 0.2), (1.0, 0.5)):
    r = metricas(depth, w_habla, w_proto)
    r.update(depth=depth, habla=w_habla, proto=w_proto, actual=(depth, w_habla, w_proto) == (20, 0.5, 1.0))
    resultados.append(r)
resultados.sort(key=lambda r: (-r["mrr"], -r["r5"], -r["r1"]))
print(f"\n== COMBINACIONES (con_respuesta={len(answerable)}) ==")
print(f"  {'prof':>4} {'habla':>5} {'proto':>5} | {'R@1':>5} {'R@3':>5} {'R@5':>5} {'MRR':>6} | habla_top5")
for r in resultados:
    print(f"  {r['depth']:>4} {r['habla']:>5} {r['proto']:>5} | {r['r1']:>5} {r['r3']:>5} {r['r5']:>5} {r['mrr']:>6} | {r['habla_top5']:>5}"
          + ("   <- ACTUAL" if r["actual"] else ""))

# ---------------- 3. Senal de confianza por ventana ----------------
def auc(pos, neg):
    if not pos or not neg: return None
    s = sum(1.0 if p > n else 0.5 if p == n else 0.0 for p in pos for n in neg)
    return round(s / (len(pos) * len(neg)), 3)
print("\n== CONFIANZA (coincidencias entre los K primeros de BM25 y e5) ==")
print(f"  {'K':>3} | {'AUC':>5} | con_respuesta: o=0  o=1  o>=2 | sin_respuesta: o=0  o>=1")
confianza = {}
for K in (5, 10, 15, 20):
    o = {q.id: len({i for i, _ in rank_d[q.id][:K]} & {i for i, _ in rank_l[q.id][:K]}) for q in questions}
    pos, neg = [o[q.id] for q in answerable], [o[q.id] for q in unanswerable]
    confianza[K] = {"auc": auc(pos, neg)}
    print(f"  {K:>3} | {str(auc(pos, neg)):>5} |               {sum(v == 0 for v in pos):>4} {sum(v == 1 for v in pos):>4} {sum(v >= 2 for v in pos):>5} |"
          f"               {sum(v == 0 for v in neg):>4} {sum(v >= 1 for v in neg):>4}")

mejor = resultados[0]
actual = next(r for r in resultados if r["actual"])
print("\n== DETALLE POR PREGUNTA: actual vs mejor combinacion (posicion de la respuesta) ==")
for q in answerable:
    a, b = actual["ranks"][q.id], mejor["ranks"][q.id]
    marca = "  mejora" if (b or 99) < (a or 99) else "  EMPEORA" if (b or 99) > (a or 99) else ""
    print(f"  {q.id} {q.topic:26s} actual={str(a):>4} mejor={str(b):>4}{marca}")

Path("evaluation/results").mkdir(parents=True, exist_ok=True)
Path("evaluation/results/calibracion-v2.json").write_text(json.dumps(
    {"fragmentos": len(corpus), "combinaciones": resultados, "confianza": confianza}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nTEST: fragmentos={len(corpus)} | mejor: prof={mejor['depth']} habla={mejor['habla']} proto={mejor['proto']} "
      f"R@1={mejor['r1']} R@5={mejor['r5']} MRR={mejor['mrr']} | actual: R@1={actual['r1']} R@5={actual['r5']} MRR={actual['mrr']}")
