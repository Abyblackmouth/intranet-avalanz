# ----------------------------------------------------------------------
# Pruebas del caso de uso de busqueda con piezas de juguete
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import asyncio
import uuid

from app.application.search_knowledge import SearchKnowledge
from app.domain.models import BlockKind, Confidence, Location, SearchHit

IDS = {name: uuid.uuid5(uuid.NAMESPACE_DNS, name) for name in ("manual", "habla", "otro", "lejano")}
KINDS = {"manual": BlockKind.TEXT, "habla": BlockKind.SPEECH, "otro": BlockKind.TEXT, "lejano": BlockKind.TEXT}


class FakeEmbedder:
    model_name = "falso"
    dimensions = 3

    def embed_query(self, text):
        return [1.0, 0.0, 0.0]

    def embed_documents(self, texts):
        return [[1.0, 0.0, 0.0] for _ in texts]


class FakeSearcher:
    def __init__(self, order):
        self.order = order
        self.modules_seen = None

    async def search(self, query_or_vector, modules, limit):
        self.modules_seen = list(modules)
        return [(IDS[n], 1.0) for n in self.order][:limit]


class FakeReader:
    async def read(self, chunk_ids):
        names = {v: k for k, v in IDS.items()}
        return {i: SearchHit(i, names[i], f"m/t/{names[i]}.pdf", "m", KINDS[names[i]], "texto", "", Location())
                for i in chunk_ids}


class MemoryLog:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


def _run(dense_order, lexical_order, modules=("m",), question="¿Cómo hago algo?"):
    dense, lexical, log = FakeSearcher(dense_order), FakeSearcher(lexical_order), MemoryLog()
    use_case = SearchKnowledge(FakeEmbedder(), dense, lexical, FakeReader(), log)
    result = asyncio.run(use_case.run(question, list(modules), "usuario-1", "m"))
    return result, dense, lexical, log


def test_speech_first_in_both_lists_is_pushed_down():
    result, *_ = _run(["habla", "manual"], ["habla", "manual"])
    assert result.hits[0].document_title == "manual"


def test_agreement_gives_high_confidence_and_disagreement_low():
    alta, *_ = _run(["manual", "otro"], ["otro", "manual"])
    baja, *_ = _run(["manual"], ["lejano"])
    assert (alta.confidence, alta.overlap) == (Confidence.HIGH, 2)
    assert (baja.confidence, baja.overlap) == (Confidence.LOW, 0)


def test_modules_are_passed_to_both_searches_and_query_is_logged():
    result, dense, lexical, log = _run(["manual"], ["manual"], modules=("it-service-desk",))
    assert dense.modules_seen == lexical.modules_seen == ["it-service-desk"]
    assert len(log.records) == 1 and log.records[0]["module"] == "m"


def test_no_modules_means_no_search_and_no_log():
    result, dense, lexical, log = _run(["manual"], ["manual"], modules=())
    assert result.hits == () and dense.modules_seen is None and log.records == []
