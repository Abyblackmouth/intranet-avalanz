# ----------------------------------------------------------------------
# Cargador de transcripciones de Teams
# Implementa el puerto DocumentLoader para los archivos
# "<nombre>.transcripcion.docx" que acompanan a un video. Entrega una
# intervencion por bloque, con hablante, minuto de inicio y minuto de
# fin. Agrupar intervenciones es trabajo del fragmentador.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# python-docx lee los parrafos del Word; las reglas de reconocimiento
# vienen de transcript_rules.
# ----------------------------------------------------------------------
from pathlib import Path

from docx import Document

from app.domain.models import TRANSCRIPT_SUFFIX, BlockKind, ExtractedBlock, Location, SourceKind
from app.pipeline.loaders.transcript_rules import parse_teams_paragraph


class TeamsTranscriptLoader:
    kind = SourceKind.TEAMS_TRANSCRIPT

    # ------------------------------------------------------------------
    # Solo aplica a transcripciones que siguen la convencion de nombre
    # ------------------------------------------------------------------
    def supports(self, path: Path) -> bool:
        return path.name.lower().endswith(f"{TRANSCRIPT_SUFFIX}.docx")

    # ------------------------------------------------------------------
    # Cada intervencion termina donde empieza la siguiente; la ultima
    # queda sin fin conocido.
    # ------------------------------------------------------------------
    def load(self, path: Path) -> list[ExtractedBlock]:
        turns = [turn for paragraph in Document(str(path)).paragraphs
                 if (turn := parse_teams_paragraph(paragraph.text))]
        blocks = []
        for index, turn in enumerate(turns):
            end = turns[index + 1].seconds if index + 1 < len(turns) else None
            blocks.append(ExtractedBlock(
                text=turn.text,
                location=Location(start_seconds=turn.seconds, end_seconds=end),
                kind=BlockKind.SPEECH,
                speaker=turn.speaker,
            ))
        return blocks
