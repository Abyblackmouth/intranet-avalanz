# ----------------------------------------------------------------------
# Caso de uso: busqueda en el conocimiento
# Busqueda hibrida filtrada por los modulos permitidos: semantica y por
# palabras, fusion RRF, habla ponderada, top 5 y confianza por
# coincidencias. Registra cada consulta. Solo conoce puertos.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import time
from collections.abc import Sequence
from dataclasses import dataclass, replace

from app.domain.models import BlockKind, Confidence, SearchResult
from app.domain.ports import DenseSearcher, Embedder, HitReader, LexicalSearcher, QueryLog
from app.pipeline.retrieval.fusion import (
    apply_kind_weights,
    confidence_from_overlap,
    reciprocal_rank_fusion,
    top_overlap,
)


# ----------------------------------------------------------------------
# Parametros de la busqueda (los valores evaluados)
# ----------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class SearchSettings:
    # Candidatos que aporta cada busqueda a la fusion
    depth: int = 20
    # Constante de RRF
    kappa: int = 60
    # Resultados que se entregan
    top_k: int = 5
    # Peso de los fragmentos de habla (provisional: validar con preguntas v2)
    # Calibrado con el corpus de 3,737 fragmentos y las preguntas v2: 0.3 sube
    # R@1 de 0.50 a 0.58 y MRR de 0.648 a 0.730 sin perder R@5 (0.2 da lo mismo)
    speech_weight: float = 0.3
    # Ventana para contar coincidencias y cortes de confianza
    # Con el corpus grande, 5 marcaba como "baja" 8 de 24 preguntas con respuesta;
    # con 15 solo 1 de 24 (detecta 2 de 6 sin respuesta en lugar de 4)
    overlap_window: int = 15
    low_max: int = 0
    medium_max: int = 1


class SearchKnowledge:
    def __init__(self, embedder: Embedder, dense: DenseSearcher, lexical: LexicalSearcher,
                 reader: HitReader, log: QueryLog, settings: SearchSettings | None = None) -> None:
        self.embedder = embedder
        self.dense = dense
        self.lexical = lexical
        self.reader = reader
        self.log = log
        self.settings = settings or SearchSettings()

    # ------------------------------------------------------------------
    # Una busqueda completa
    # Sin pregunta o sin modulos permitidos no se busca ni se registra.
    # ------------------------------------------------------------------
    async def run(self, question: str, modules: Sequence[str], user_id: str, context_module: str) -> SearchResult:
        cfg = self.settings
        question = question.strip()
        if not question or not modules:
            return SearchResult(hits=(), confidence=Confidence.LOW, overlap=0)
        start = time.perf_counter()

        # Los dos rankings, cada uno filtrado por los modulos permitidos
        vector = self.embedder.embed_query(question)
        dense_ids = [i for i, _ in await self.dense.search(vector, modules, cfg.depth)]
        lexical_ids = [i for i, _ in await self.lexical.search(question, modules, cfg.depth)]

        # Datos de los candidatos (el tipo hace falta para ponderar el habla)
        candidates = await self.reader.read(list(dict.fromkeys(dense_ids + lexical_ids)))

        # Fusion, ponderacion del habla y los primeros top_k
        scores = reciprocal_rank_fusion([dense_ids, lexical_ids], cfg.kappa)
        scores = apply_kind_weights(scores, {i: h.kind for i, h in candidates.items()},
                                    {BlockKind.SPEECH: cfg.speech_weight})
        ordered = [i for i, _ in sorted(scores.items(), key=lambda item: -item[1]) if i in candidates]
        hits = tuple(replace(candidates[i], score=round(scores[i], 6)) for i in ordered[:cfg.top_k])

        # Confianza por coincidencias entre los dos rankings
        overlap = top_overlap(dense_ids, lexical_ids, cfg.overlap_window)
        result = SearchResult(hits=hits, overlap=overlap,
                              confidence=confidence_from_overlap(overlap, cfg.low_max, cfg.medium_max))

        await self.log.record(user_id=user_id, module=context_module, question=question, result=result,
                              latency_ms=int((time.perf_counter() - start) * 1000))
        return result
