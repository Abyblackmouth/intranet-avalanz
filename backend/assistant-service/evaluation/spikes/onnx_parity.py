# ----------------------------------------------------------------------
# Verificacion de paridad PyTorch contra ONNX
# Codifica los mismos textos con sentence-transformers (referencia) y con
# el adaptador de produccion (ONNX fp32 e int8), y mide la similitud
# coseno entre los vectores de cada par. Uso:
#   python -m evaluation.spikes.onnx_parity /modelos/e5-small
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import sys
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

from app.adapters.onnx_embedder import OnnxEmbedder
from evaluation.corpus import build_corpus
from evaluation.questions import load_questions

model_dir = Path(sys.argv[1])

# Muestra: 100 fragmentos repartidos en el corpus y las 25 preguntas
corpus = build_corpus(Path("/fuentes"))
step = max(1, len(corpus) // 100)
passages = [chunk.embedding_text for _, chunk in corpus[::step]][:100]
questions = [q.text for q in load_questions(Path("evaluation/datasets/preguntas-v1.xlsx"))]

reference = SentenceTransformer("intfloat/multilingual-e5-small", device="cpu")
reference.max_seq_length = 512
ref_p = reference.encode(["passage: " + t for t in passages], normalize_embeddings=True)
ref_q = reference.encode(["query: " + t for t in questions], normalize_embeddings=True)

results = []
for model_file in ("model.onnx", "model_int8.onnx"):
    embedder = OnnxEmbedder(model_dir, model_file=model_file)
    onnx_p = np.array(embedder.embed_documents(passages))
    onnx_q = np.array([embedder.embed_query(t) for t in questions])
    cos = np.concatenate([(ref_p * onnx_p).sum(1), (ref_q * onnx_q).sum(1)])
    results.append(f"{model_file}: coseno_medio={cos.mean():.4f} coseno_min={cos.min():.4f}")
print("PARIDAD: " + " | ".join(results), flush=True)
