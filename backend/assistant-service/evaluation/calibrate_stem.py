# ----------------------------------------------------------------------
# Experimento: raices de palabras (Snowball, espanol) en BM25
# "facturar" y "factura" son la misma raiz (factur): el usuario pregunta
# con verbos y los manuales usan sustantivos. Compara BM25 actual contra
# BM25 con raices, con la configuracion de produccion (profundidad 20,
# habla 0.3, busqueda exacta, ventana de confianza 15). No toca produccion.
# ----------------------------------------------------------------------
import json, re, statistics, unicodedata
from pathlib import Path, PurePosixPath

import numpy as np
import openpyxl
import snowballstemmer

from app.domain.models import BlockKind
from evaluation.corpus import build_corpus
from evaluation.questions import load_questions
from evaluation.relevance import is_relevant
from evaluation.retrieval_benchmark import Bm25Retriever, OnnxRetriever

V2 = Path("evaluation/datasets/preguntas-v2.xlsx")
NUEVA = ("P35", "no se como facturar una venta", "proceso", "totvs-ventas-facturacion",
         "manual-autocapacitacion-ventas-facturacion-v2.pdf", "19")
ST = snowballstemmer.stemmer("spanish")

def plano(t): return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
def tokenize_raiz(texto): return [plano(ST.stemWord(t)) for t in re.findall(r"\w+", texto.lower()) if len(t) > 2]

class Bm25Raiz(Bm25Retriever):
    def index(self, texts):
        from rank_bm25 import BM25Okapi
        self.bm25 = BM25Okapi([tokenize_raiz(t) for t in texts])
    def search(self, query, k):
        scores = self.bm25.get_scores(tokenize_raiz(query)); top = np.argsort(-scores)[:k]
        return [(int(i), float(scores[i])) for i in top]

wb = openpyxl.load_workbook(V2); ws = wb["Preguntas"]
if NUEVA[0] not in {str(f[0].value) for f in ws.iter_rows(min_row=2)}:
    ws.append(list(NUEVA) + [""]); wb.save(V2)
questions = load_questions(V2)
con = [q for q in questions if q.answerable]; sin = [q for q in questions if not q.answerable]
print(f"Preguntas: con_respuesta={len(con)} | sin_respuesta={len(sin)}", flush=True)

print("Construyendo y vectorizando el corpus (varios minutos) ...", flush=True)
corpus = build_corpus(Path("/fuentes"))
textos = [c.embedding_text for _, c in corpus]
es_habla = [c.kind == BlockKind.SPEECH for _, c in corpus]
dense = OnnxRetriever("model.onnx"); dense.index(textos)
variantes = {"actual": Bm25Retriever(), "raices": Bm25Raiz()}
for v in variantes.values(): v.index(textos)
rank_d = {q.id: dense.search(q.text, 20) for q in questions}

def evaluar(nombre):
    lex = variantes[nombre]; ranks, conf = {}, {}
    for q in questions:
        rl = lex.search(q.text, 20); f = {}
        for ranking in (rank_d[q.id], rl):
            for pos, (i, _) in enumerate(ranking, start=1): f[i] = f.get(i, 0.0) + 1.0 / (60 + pos)
        for i in f:
            if es_habla[i]: f[i] *= 0.3
        top = [i for i, _ in sorted(f.items(), key=lambda x: -x[1])[:10]]
        conf[q.id] = len({i for i, _ in rank_d[q.id][:15]} & {i for i, _ in rl[:15]})
        if q.answerable:
            rel = [r for r, i in enumerate(top, start=1) if is_relevant(q, *corpus[i])]
            ranks[q.id] = rel[0] if rel else None
    v = list(ranks.values()); m = lambda x: round(statistics.mean(x), 3)
    return {"ranks": ranks, "conf": conf, "r1": m([1.0 if r == 1 else 0.0 for r in v]),
            "r3": m([1.0 if r and r <= 3 else 0.0 for r in v]), "r5": m([1.0 if r and r <= 5 else 0.0 for r in v]),
            "mrr": m([1 / r if r else 0.0 for r in v]),
            "baja_con": sum(conf[q.id] == 0 for q in con), "detecta_sin": sum(conf[q.id] == 0 for q in sin)}

res = {n: evaluar(n) for n in variantes}
print(f"\n== RESULTADOS ({len(con)} con respuesta, {len(sin)} sin ella) ==")
print(f"  {'BM25':8s} | {'R@1':>5} {'R@3':>5} {'R@5':>5} {'MRR':>6} | con respuesta en baja | sin respuesta detectadas")
for n, r in res.items():
    print(f"  {n:8s} | {r['r1']:>5} {r['r3']:>5} {r['r5']:>5} {r['mrr']:>6} | {r['baja_con']:>12} de {len(con)}"
          f"       | {r['detecta_sin']:>8} de {len(sin)}")
print("\n== PREGUNTAS QUE CAMBIAN (posicion de la respuesta; confianza = coincidencias) ==")
a, b = res["actual"], res["raices"]
for q in questions:
    ra, rb = (a["ranks"].get(q.id), b["ranks"].get(q.id)) if q.answerable else ("-", "-")
    if ra != rb or a["conf"][q.id] != b["conf"][q.id] or q.id in ("P29", "P35"):
        marca = ""
        if q.answerable and ra != rb: marca = "  mejora" if (rb or 99) < (ra or 99) else "  EMPEORA"
        print(f"  {q.id} {q.text[:42]:42s} posicion {str(ra):>4} -> {str(rb):>4} | coincidencias {a['conf'][q.id]:>2} -> {b['conf'][q.id]:>2}{marca}")
Path("evaluation/results/calibracion-raices.json").write_text(json.dumps(
    {n: {k: v for k, v in r.items() if k not in ("ranks", "conf")} for n, r in res.items()}, indent=2), encoding="utf-8")
print(f"\nTEST: actual R@1={a['r1']} R@5={a['r5']} MRR={a['mrr']} baja={a['baja_con']} | "
      f"raices R@1={b['r1']} R@5={b['r5']} MRR={b['mrr']} baja={b['baja_con']}")
