# ----------------------------------------------------------------------
# Pruebas del caso de uso de ingesta
# Piezas de juguete en lugar de base de datos y modelo: es la ventaja de
# depender solo de puertos. El fragmentador es el real (codigo puro).
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import asyncio
from pathlib import Path

from app.application.ingest_documents import IngestDocuments
from app.domain.models import BlockKind, ExtractedBlock, Location, SourceKind
from app.pipeline.chunking.structure_chunker import StructureChunker


# ----------------------------------------------------------------------
# Piezas de juguete
# ----------------------------------------------------------------------
class TextLoader:
    kind = SourceKind.TEXT

    def __init__(self, broken: str | None = None) -> None:
        self.broken = broken

    def supports(self, path: Path) -> bool:
        return path.suffix == ".txt"

    def load(self, path: Path) -> list[ExtractedBlock]:
        if path.name == self.broken:
            raise ValueError("archivo danado")
        return [ExtractedBlock(path.read_text(), Location(), BlockKind.TEXT, ("Seccion",))]


class FakeEmbedder:
    dimensions = 3

    def __init__(self, model_name: str = "modelo-a") -> None:
        self.model_name = model_name

    def embed_documents(self, texts):
        return [[0.0, 0.0, 1.0] for _ in texts]

    def embed_query(self, text):
        return [0.0, 0.0, 1.0]


class MemoryStore:
    def __init__(self) -> None:
        self.documents: dict[str, tuple[str, str]] = {}

    async def indexed_documents(self):
        return dict(self.documents)

    async def replace_document(self, document, chunks, vectors, embedding_model):
        self.documents[document.relative_path] = (document.checksum, embedding_model)

    async def remove_document(self, relative_path):
        self.documents.pop(relative_path, None)


def _sources(tmp_path: Path) -> Path:
    tema = tmp_path / "modulo" / "tema"
    tema.mkdir(parents=True)
    (tema / "a.txt").write_text("Contenido A.")
    (tema / "b.txt").write_text("Contenido B.")
    return tmp_path


def _run(sources, store, loader=None, model="modelo-a"):
    use_case = IngestDocuments([loader or TextLoader()], StructureChunker(), FakeEmbedder(model), store, sources)
    return asyncio.run(use_case.run())


# ----------------------------------------------------------------------
# Escenarios
# ----------------------------------------------------------------------
def test_first_run_indexes_everything(tmp_path):
    store = MemoryStore()
    report = _run(_sources(tmp_path), store)
    assert (report.new, report.chunks_written) == (2, 2)
    assert set(store.documents) == {"modulo/tema/a.txt", "modulo/tema/b.txt"}


def test_second_run_skips_unchanged(tmp_path):
    sources, store = _sources(tmp_path), MemoryStore()
    _run(sources, store)
    report = _run(sources, store)
    assert (report.new, report.unchanged, report.chunks_written) == (0, 2, 0)


def test_modified_file_is_reindexed(tmp_path):
    sources, store = _sources(tmp_path), MemoryStore()
    _run(sources, store)
    (sources / "modulo" / "tema" / "a.txt").write_text("Contenido A corregido.")
    report = _run(sources, store)
    assert (report.updated, report.unchanged) == (1, 1)


def test_deleted_file_is_removed(tmp_path):
    sources, store = _sources(tmp_path), MemoryStore()
    _run(sources, store)
    (sources / "modulo" / "tema" / "b.txt").unlink()
    report = _run(sources, store)
    assert report.removed == 1 and set(store.documents) == {"modulo/tema/a.txt"}


def test_failure_keeps_previous_version(tmp_path):
    sources, store = _sources(tmp_path), MemoryStore()
    _run(sources, store)
    (sources / "modulo" / "tema" / "a.txt").write_text("Cambio que ya no se puede leer.")
    report = _run(sources, store, loader=TextLoader(broken="a.txt"))
    assert report.failed == ["modulo/tema/a.txt"] and report.removed == 0
    assert "modulo/tema/a.txt" in store.documents


def test_model_change_reindexes(tmp_path):
    sources, store = _sources(tmp_path), MemoryStore()
    _run(sources, store)
    report = _run(sources, store, model="modelo-b")
    assert report.updated == 2


def test_videos_with_and_without_transcript(tmp_path):
    sources = _sources(tmp_path)
    tema = sources / "modulo" / "tema"
    (tema / "con.mp4").write_bytes(b"x")
    (tema / "con.transcripcion.docx").write_bytes(b"x")
    (tema / "sin.mp4").write_bytes(b"x")
    report = _run(sources, MemoryStore())
    assert report.videos_without_transcript == ["modulo/tema/sin.mp4"]
