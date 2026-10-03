# ----------------------------------------------------------------------
# Adaptador de embeddings con ONNX Runtime
# Implementa el puerto Embedder sin PyTorch: el modelo exportado a ONNX
# (fp32; la version int8 degrado Recall@5 de 0.90 a 0.70) corre con onnxruntime y el texto se tokeniza con
# la libreria tokenizers. Consume una fraccion de la memoria de la
# version PyTorch y produce vectores practicamente identicos.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from app.adapters.embedding_math import mean_pool_normalize


class OnnxEmbedder:
    # ------------------------------------------------------------------
    # Carga del modelo y del tokenizador
    # Los modelos e5 requieren prefijos distintos para preguntas y para
    # fragmentos. threads limita los nucleos para no competir con los
    # demas servicios del servidor.
    # ------------------------------------------------------------------
    def __init__(self, model_dir: Path, model_file: str = "model.onnx",
                 model_name: str = "multilingual-e5-small",
                 query_prefix: str = "query: ", passage_prefix: str = "passage: ",
                 max_length: int = 512, batch_size: int = 16, threads: int = 2) -> None:
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model_dir / model_file), sess_options=options,
                                            providers=["CPUExecutionProvider"])
        self.inputs = {item.name for item in self.session.get_inputs()}

        self.tokenizer = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=max_length)
        pad_id = self.tokenizer.token_to_id("<pad>")
        self.tokenizer.enable_padding(pad_id=pad_id if pad_id is not None else 1, pad_token="<pad>")

        self.model_name = f"{model_name}-onnx-{Path(model_file).stem}"
        self.query_prefix = query_prefix
        self.passage_prefix = passage_prefix
        self.batch_size = batch_size
        self.dimensions = len(self.embed_query("dimension"))

    # ------------------------------------------------------------------
    # Codificacion por lotes: tokens, modelo y mean pooling normalizado
    # ------------------------------------------------------------------
    def _encode(self, texts: Sequence[str]) -> np.ndarray:
        vectors = []
        for start in range(0, len(texts), self.batch_size):
            encoded = self.tokenizer.encode_batch(list(texts[start:start + self.batch_size]))
            ids = np.array([e.ids for e in encoded], dtype=np.int64)
            mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
            feeds = {"input_ids": ids, "attention_mask": mask}
            if "token_type_ids" in self.inputs:
                feeds["token_type_ids"] = np.zeros_like(ids)
            hidden = self.session.run(None, feeds)[0]
            vectors.append(mean_pool_normalize(hidden, mask))
        return np.vstack(vectors)

    # ------------------------------------------------------------------
    # Puerto Embedder
    # ------------------------------------------------------------------
    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._encode([self.passage_prefix + text for text in texts]).tolist()

    def embed_query(self, text: str) -> list[float]:
        return self._encode([self.query_prefix + text])[0].tolist()
