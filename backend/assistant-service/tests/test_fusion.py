# ----------------------------------------------------------------------
# Pruebas de la fusion de rankings y la confianza
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from app.domain.models import BlockKind, Confidence
from app.pipeline.retrieval.fusion import (
    apply_kind_weights,
    confidence_from_overlap,
    reciprocal_rank_fusion,
    top_overlap,
)


def test_rrf_rewards_items_in_both_rankings():
    scores = reciprocal_rank_fusion([["a", "b"], ["b", "c"]], kappa=60)
    assert scores["b"] == 1 / 62 + 1 / 61
    assert max(scores, key=scores.get) == "b"


def test_speech_weight_halves_speech_only():
    scores = apply_kind_weights({"x": 1.0, "y": 1.0}, {"x": BlockKind.SPEECH, "y": BlockKind.TEXT},
                                {BlockKind.SPEECH: 0.5})
    assert scores == {"x": 0.5, "y": 1.0}


def test_overlap_counts_first_n_only():
    assert top_overlap(["a", "b", "c", "d", "e", "f"], ["f", "e", "z"], n=5) == 1


def test_confidence_cutoffs():
    assert [confidence_from_overlap(n) for n in (0, 1, 2, 4)] == [
        Confidence.LOW, Confidence.MEDIUM, Confidence.HIGH, Confidence.HIGH]
