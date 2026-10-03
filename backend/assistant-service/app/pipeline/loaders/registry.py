# ----------------------------------------------------------------------
# Registro de cargadores
# La lista de cargadores en un solo lugar. El orden importa: el primero
# que reconoce un archivo es el que lo procesa, y la transcripcion de
# Teams (.transcripcion.docx) debe ir antes que el Word general.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from app.domain.ports import DocumentLoader
from app.pipeline.loaders.docx_loader import WordLoader
from app.pipeline.loaders.pdf_loader import PdfLoader
from app.pipeline.loaders.pptx_loader import PowerPointLoader
from app.pipeline.loaders.teams_transcript_loader import TeamsTranscriptLoader


def default_loaders() -> list[DocumentLoader]:
    return [TeamsTranscriptLoader(), WordLoader(), PdfLoader(), PowerPointLoader()]
