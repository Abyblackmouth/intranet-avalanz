# ----------------------------------------------------------------------
# Fusion de rankings y confianza
# Funciones puras de la busqueda hibrida: la misma logica que gano en la
# evaluacion (RRF, habla x 0.5, coincidencias en el top 5).
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from collections.abc import Hashable, Mapping, Sequence

from app.domain.models import BlockKind, Confidence


# ----------------------------------------------------------------------
# Fusion reciproca de rankings (RRF)
# Cada elemento suma 1 / (kappa + posicion) por cada ranking donde
# aparece. No necesita calibrar puntuaciones de escalas distintas.
# ----------------------------------------------------------------------
def reciprocal_rank_fusion(rankings: Sequence[Sequence[Hashable]], kappa: int = 60) -> dict:
    scores: dict = {}
    for ranking in rankings:
        for position, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (kappa + position)
    return scores


# ----------------------------------------------------------------------
# Ponderacion por tipo de fragmento
# Multiplica la puntuacion de los tipos indicados (habla x 0.5 para
# compensar que las transcripciones son la mayoria del corpus).
# ----------------------------------------------------------------------
def apply_kind_weights(scores: Mapping, kinds: Mapping, weights: Mapping[BlockKind, float]) -> dict:
    return {item: score * weights.get(kinds.get(item), 1.0) for item, score in scores.items()}


# ----------------------------------------------------------------------
# Coincidencias entre los primeros n de dos rankings
# ----------------------------------------------------------------------
def top_overlap(first: Sequence[Hashable], second: Sequence[Hashable], n: int = 5) -> int:
    return len(set(first[:n]) & set(second[:n]))


# ----------------------------------------------------------------------
# Confianza a partir de las coincidencias
# Corte evaluado: 0 coincidencias detecta 4 de 5 preguntas sin respuesta
# con 2 de 20 falsas alarmas.
# ----------------------------------------------------------------------
def confidence_from_overlap(overlap: int, low_max: int = 0, medium_max: int = 1) -> Confidence:
    if overlap <= low_max:
        return Confidence.LOW
    if overlap <= medium_max:
        return Confidence.MEDIUM
    return Confidence.HIGH
