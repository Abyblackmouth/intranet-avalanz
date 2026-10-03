# ----------------------------------------------------------------------
# Banco de evaluacion de recuperacion
# Indexa el corpus real con un recuperador (BM25 o un modelo de
# embeddings), hace cada pregunta del conjunto de evaluacion y mide
# recall@k, MRR, separacion de similitud entre preguntas con y sin
# respuesta, intrusion de transcripciones, tiempos y memoria. Guarda un
# JSON por recuperador en evaluation/results. Uso:
#   python -m evaluation.retrieval_benchmark --retriever e5-small
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# Las librerias pesadas (torch, sentence-transformers) se importan solo
# dentro del recuperador denso, para que BM25 corra sin ellas.
# ----------------------------------------------------------------------
import argparse
import json
import re
import resource
import statistics
import time
import unicodedata
from datetime import datetime
from pathlib import Path, PurePosixPath

import numpy as np

from app.domain.models import BlockKind
from evaluation.corpus import build_corpus
from evaluation.questions import load_questions
from evaluation.relevance import is_relevant

TOP_K = 10


# ----------------------------------------------------------------------
# Tokenizacion para BM25: sin acentos, minusculas, palabras de 3 letras
# o mas (descarta articulos y preposiciones cortas)
# ----------------------------------------------------------------------
def tokenize(text: str) -> list[str]:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return [token for token in re.findall(r"\w+", plain) if len(token) > 2]


# ----------------------------------------------------------------------
# Recuperador por palabras (linea base, sin IA)
# ----------------------------------------------------------------------
class Bm25Retriever:
    dimensions = None

    def index(self, texts: list[str]) -> None:
        from rank_bm25 import BM25Okapi
        self.bm25 = BM25Okapi([tokenize(text) for text in texts])

    def search(self, query: str, k: int) -> list[tuple[int, float]]:
        scores = self.bm25.get_scores(tokenize(query))
        top = np.argsort(-scores)[:k]
        return [(int(i), float(scores[i])) for i in top]


# ----------------------------------------------------------------------
# Recuperador denso (embeddings)
# Los modelos e5 requieren prefijos distintos para preguntas
# ("query: ") y fragmentos ("passage: "); bge-m3 no usa prefijos.
# Vectores normalizados: el producto punto es la similitud coseno.
# ----------------------------------------------------------------------
class DenseRetriever:
    def __init__(self, model_id: str, query_prefix: str = "", passage_prefix: str = "") -> None:
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(model_id, device="cpu")
        self.model.max_seq_length = 512
        self.query_prefix = query_prefix
        self.passage_prefix = passage_prefix
        self.dimensions = self.model.get_sentence_embedding_dimension()

    def index(self, texts: list[str]) -> None:
        self.matrix = self.model.encode([self.passage_prefix + t for t in texts], batch_size=16,
                                        normalize_embeddings=True, convert_to_numpy=True)

    def search(self, query: str, k: int) -> list[tuple[int, float]]:
        vector = self.model.encode([self.query_prefix + query], normalize_embeddings=True,
                                   convert_to_numpy=True)[0]
        scores = self.matrix @ vector
        top = np.argsort(-scores)[:k]
        return [(int(i), float(scores[i])) for i in top]


# ----------------------------------------------------------------------
# Recuperador con el adaptador de produccion (ONNX int8, sin PyTorch)
# ----------------------------------------------------------------------
class OnnxRetriever:
    def __init__(self, model_file: str = "model.onnx") -> None:
        from app.adapters.onnx_embedder import OnnxEmbedder
        self.embedder = OnnxEmbedder(Path("/modelos/e5-small"), model_file=model_file)
        self.dimensions = self.embedder.dimensions

    def index(self, texts: list[str]) -> None:
        self.matrix = np.array(self.embedder.embed_documents(texts))

    def search(self, query: str, k: int) -> list[tuple[int, float]]:
        scores = self.matrix @ np.array(self.embedder.embed_query(query))
        top = np.argsort(-scores)[:k]
        return [(int(i), float(scores[i])) for i in top]


# ----------------------------------------------------------------------
# Recuperador hibrido: fusion RRF de e5-small (ONNX fp32) y BM25
# Cada fragmento suma 1 / (kappa + posicion) por cada lista donde aparece
# entre los primeros "depth". speech_weight multiplica la puntuacion de
# los fragmentos de habla para compensar el desbalance del corpus.
# ----------------------------------------------------------------------
class HybridRetriever:
    def __init__(self, speech_weight: float = 1.0, depth: int = 20, kappa: int = 60) -> None:
        self.dense = OnnxRetriever("model.onnx")
        self.lexical = Bm25Retriever()
        self.dimensions = self.dense.dimensions
        self.speech_weight = speech_weight
        self.depth = depth
        self.kappa = kappa
        self.kinds = None

    def index(self, texts: list[str]) -> None:
        self.dense.index(texts)
        self.lexical.index(texts)

    def search(self, query: str, k: int) -> list[tuple[int, float]]:
        fused: dict[int, float] = {}
        for ranking in (self.dense.search(query, self.depth), self.lexical.search(query, self.depth)):
            for position, (i, _) in enumerate(ranking, start=1):
                fused[i] = fused.get(i, 0.0) + 1.0 / (self.kappa + position)
        if self.speech_weight != 1.0 and self.kinds is not None:
            for i in fused:
                if self.kinds[i] == BlockKind.SPEECH:
                    fused[i] *= self.speech_weight
        return sorted(fused.items(), key=lambda item: -item[1])[:k]


# ----------------------------------------------------------------------
# Recuperadores disponibles
# ----------------------------------------------------------------------
RETRIEVERS = {
    "bm25": Bm25Retriever,
    "e5-small": lambda: DenseRetriever("intfloat/multilingual-e5-small", "query: ", "passage: "),
    "e5-base": lambda: DenseRetriever("intfloat/multilingual-e5-base", "query: ", "passage: "),
    "bge-m3": lambda: DenseRetriever("BAAI/bge-m3"),
    "e5-small-onnx": lambda: OnnxRetriever("model.onnx"),
    "e5-small-onnx-int8": lambda: OnnxRetriever("model_int8.onnx"),
    "hybrid": lambda: HybridRetriever(),
    "hybrid-habla-0.5": lambda: HybridRetriever(speech_weight=0.5),
}


# ----------------------------------------------------------------------
# Promedio con tres decimales; None si no hay datos
# ----------------------------------------------------------------------
def _mean(values: list[float]) -> float | None:
    return round(statistics.mean(values), 3) if values else None


# ----------------------------------------------------------------------
# Ejecucion completa para un recuperador
# ----------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--retriever", required=True, choices=sorted(RETRIEVERS))
    parser.add_argument("--sources", default="/fuentes")
    parser.add_argument("--questions", default="evaluation/datasets/preguntas-v1.xlsx")
    parser.add_argument("--output", default="evaluation/results")
    args = parser.parse_args()

    corpus = build_corpus(Path(args.sources))
    questions = load_questions(Path(args.questions))
    retriever = RETRIEVERS[args.retriever]()
    # El hibrido necesita saber que fragmentos son de habla
    if hasattr(retriever, "kinds"):
        retriever.kinds = [chunk.kind for _, chunk in corpus]

    # Indexacion: el texto que se vectoriza incluye el encabezado de contexto
    start = time.perf_counter()
    retriever.index([chunk.embedding_text for _, chunk in corpus])
    index_seconds = time.perf_counter() - start

    # Cada pregunta: posicion del primer fragmento relevante entre los 10 primeros
    details, latencies = [], []
    for question in questions:
        start = time.perf_counter()
        ranked = retriever.search(question.text, TOP_K)
        latencies.append((time.perf_counter() - start) * 1000)
        relevant = [rank for rank, (i, _) in enumerate(ranked, start=1) if is_relevant(question, *corpus[i])]
        details.append({
            "id": question.id,
            "kind": question.kind,
            "topic": question.topic,
            "answerable": question.answerable,
            "first_relevant_rank": relevant[0] if relevant else None,
            "top1_score": round(ranked[0][1], 4),
            "speech_in_top5": sum(1 for i, _ in ranked[:5] if corpus[i][1].kind == BlockKind.SPEECH),
            "top5": [
                {"document": PurePosixPath(corpus[i][0].relative_path).name,
                 "location": corpus[i][1].location.label(),
                 "score": round(score, 4)}
                for i, score in ranked[:5]
            ],
        })

    # Metricas: recall@k y MRR sobre las preguntas con respuesta
    answerable = [d for d in details if d["answerable"]]
    unanswerable = [d for d in details if not d["answerable"]]
    ranks = [d["first_relevant_rank"] for d in answerable]
    summary = {
        "retriever": args.retriever,
        "dimensions": retriever.dimensions,
        "questions_file": PurePosixPath(args.questions).name,
        "date": datetime.now().isoformat(timespec="seconds"),
        "chunks": len(corpus),
        "answerable": len(answerable),
        "unanswerable": len(unanswerable),
        "recall@1": _mean([1.0 if r and r <= 1 else 0.0 for r in ranks]),
        "recall@3": _mean([1.0 if r and r <= 3 else 0.0 for r in ranks]),
        "recall@5": _mean([1.0 if r and r <= 5 else 0.0 for r in ranks]),
        "recall@10": _mean([1.0 if r else 0.0 for r in ranks]),
        "mrr@10": _mean([1.0 / r if r else 0.0 for r in ranks]),
        "top1_score_answerable": _mean([d["top1_score"] for d in answerable]),
        "top1_score_unanswerable": _mean([d["top1_score"] for d in unanswerable]),
        "speech_intrusion_top5": _mean([d["speech_in_top5"] / 5 for d in answerable]),
        "index_seconds": round(index_seconds, 1),
        "query_ms_mean": round(statistics.mean(latencies), 1),
        "query_ms_max": round(max(latencies), 1),
        "ram_peak_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024),
    }

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / f"{args.retriever}.json").write_text(
        json.dumps({"summary": summary, "questions": details}, ensure_ascii=False, indent=2), encoding="utf-8")

    s = summary
    print(f"TEST: modelo={s['retriever']} | dims={s['dimensions']} | recall@1={s['recall@1']} | "
          f"recall@5={s['recall@5']} | mrr={s['mrr@10']} | sim_con={s['top1_score_answerable']} | "
          f"sim_sin={s['top1_score_unanswerable']} | habla_top5={s['speech_intrusion_top5']} | "
          f"indexar={s['index_seconds']}s | consulta={s['query_ms_mean']}ms | ram={s['ram_peak_mb']}MB", flush=True)


if __name__ == "__main__":
    main()
