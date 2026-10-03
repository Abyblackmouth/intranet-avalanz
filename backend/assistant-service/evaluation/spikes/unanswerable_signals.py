# ----------------------------------------------------------------------
# Senales para detectar preguntas sin respuesta
# Para cada pregunta calcula cinco senales a partir de los rankings de
# e5-small (ONNX) y BM25, y mide con AUC que tan bien separa cada una
# las preguntas con respuesta de las que no la tienen. Uso:
#   python -m evaluation.spikes.unanswerable_signals
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import json
from pathlib import Path

from evaluation.corpus import build_corpus
from evaluation.questions import load_questions
from evaluation.retrieval_benchmark import Bm25Retriever, OnnxRetriever


# ----------------------------------------------------------------------
# AUC: probabilidad de que una pregunta con respuesta puntue mas alto
# que una sin respuesta (los empates cuentan la mitad)
# ----------------------------------------------------------------------
def auc(positive: list[float], negative: list[float]) -> float:
    pairs = [(p > n) + 0.5 * (p == n) for p in positive for n in negative]
    return round(sum(pairs) / len(pairs), 3)


corpus = build_corpus(Path("/fuentes"))
questions = load_questions(Path("evaluation/datasets/preguntas-v1.xlsx"))
texts = [chunk.embedding_text for _, chunk in corpus]
dense, lexical = OnnxRetriever("model.onnx"), Bm25Retriever()
dense.index(texts)
lexical.index(texts)

# ----------------------------------------------------------------------
# Senales por pregunta
# ----------------------------------------------------------------------
rows = []
for question in questions:
    d = dense.search(question.text, 5)
    l = lexical.search(question.text, 5)
    rows.append({
        "id": question.id,
        "answerable": question.answerable,
        "e5_top1": d[0][1],
        "e5_margen": d[0][1] - d[1][1],
        "bm25_top1": l[0][1],
        "acuerdo_top1": 1.0 if d[0][0] == l[0][0] else 0.0,
        "coincidencias_top5": float(len({i for i, _ in d} & {i for i, _ in l})),
    })

signals = ["e5_top1", "e5_margen", "bm25_top1", "acuerdo_top1", "coincidencias_top5"]
result = {name: auc([r[name] for r in rows if r["answerable"]], [r[name] for r in rows if not r["answerable"]])
          for name in signals}
Path("evaluation/results/unanswerable_signals.json").write_text(
    json.dumps({"auc": result, "questions": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
print("SENALES: " + " | ".join(f"{k}={v}" for k, v in result.items()), flush=True)
