# ----------------------------------------------------------------------
# Construccion del corpus de evaluacion
# Lee la carpeta de fuentes con los mismos cargadores y el mismo
# fragmentador que usara la ingesta real, para que la evaluacion mida
# exactamente lo que vera el asistente en produccion.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from datetime import datetime
from pathlib import Path

from app.domain.models import Chunk, Document, parse_source_path, title_from_filename
from app.pipeline.chunking.structure_chunker import StructureChunker
from app.pipeline.loaders.docx_loader import WordLoader
from app.pipeline.loaders.pdf_loader import PdfLoader
from app.pipeline.loaders.pptx_loader import PowerPointLoader
from app.pipeline.loaders.teams_transcript_loader import TeamsTranscriptLoader

# El orden importa: la transcripcion de Teams va antes que el Word general
LOADERS = [TeamsTranscriptLoader(), WordLoader(), PdfLoader(), PowerPointLoader()]


# ----------------------------------------------------------------------
# Fragmentos de todos los documentos soportados, con su documento
# ----------------------------------------------------------------------
def build_corpus(sources: Path) -> list[tuple[Document, Chunk]]:
    chunker = StructureChunker()
    corpus: list[tuple[Document, Chunk]] = []
    for path in sorted(sources.rglob("*")):
        loader = next((l for l in LOADERS if path.is_file() and l.supports(path)), None)
        if loader is None:
            continue
        relative = str(path.relative_to(sources))
        module, topic = parse_source_path(relative)
        document = Document(
            id=Document.id_for(relative), relative_path=relative, module=module, topic=topic,
            title=title_from_filename(path.name), kind=loader.kind, checksum="",
            size_bytes=path.stat().st_size, modified_at=datetime.fromtimestamp(path.stat().st_mtime),
        )
        corpus += [(document, chunk) for chunk in chunker.split(document, loader.load(path))]
    return corpus
