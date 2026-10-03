# ----------------------------------------------------------------------
# Pruebas del fragmentador
# Codigo puro: corren sin librerias externas.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from datetime import datetime

from app.domain.models import BlockKind, Document, ExtractedBlock, Location, SourceKind
from app.pipeline.chunking.structure_chunker import (
    ChunkingRules,
    StructureChunker,
    build_context_header,
    split_table,
    split_text,
)

SMALL = ChunkingRules(target_chars=100, max_chars=150, overlap_chars=20, speech_max_seconds=240)


def _document(topic: str = "activo-fijo", title: str = "Manual x") -> Document:
    ruta = f"it-service-desk/{topic}/manual.pdf"
    return Document(id=Document.id_for(ruta), relative_path=ruta, module="it-service-desk",
                    topic=topic, title=title, kind=SourceKind.PDF, checksum="x",
                    size_bytes=1, modified_at=datetime(2026, 1, 1))


# ----------------------------------------------------------------------
# Texto: entero si cabe; si no, partido con traslape y sin exceder
# ----------------------------------------------------------------------
def test_split_text_short_stays_whole():
    assert split_text("Hola.", SMALL) == ["Hola."]


def test_split_text_long_respects_max_and_overlaps():
    texto = " ".join(f"Oracion numero {i}." for i in range(40))
    piezas = split_text(texto, SMALL)
    assert len(piezas) > 1
    assert all(len(p) <= SMALL.max_chars for p in piezas)
    assert piezas[1].split("\n")[0] in piezas[0]


# ----------------------------------------------------------------------
# Secciones: se juntan las iguales y nunca se mezclan distintas
# ----------------------------------------------------------------------
def test_same_section_merges_and_other_section_separates():
    bloques = [
        ExtractedBlock("Uno.", Location(page=1), BlockKind.TEXT, ("A",)),
        ExtractedBlock("Dos.", Location(page=2), BlockKind.TEXT, ("A",)),
        ExtractedBlock("Tres.", Location(page=2), BlockKind.TEXT, ("B",)),
    ]
    fragmentos = StructureChunker(SMALL).split(_document(), bloques)
    assert [f.text for f in fragmentos] == ["Uno.\n\nDos.", "Tres."]
    assert fragmentos[0].location.page == 1


# ----------------------------------------------------------------------
# Tablas: cada pedazo repite el encabezado
# ----------------------------------------------------------------------
def test_table_split_repeats_header():
    filas = [f"| fila {i} | valor {i} |" for i in range(30)]
    tabla = "\n".join(["| Campo | Valor |", "| --- | --- |", *filas])
    piezas = split_table(tabla, SMALL)
    assert len(piezas) > 1
    assert all(p.startswith("| Campo | Valor |\n| --- | --- |") for p in piezas)


# ----------------------------------------------------------------------
# Habla: ventanas con traslape de la ultima intervencion
# ----------------------------------------------------------------------
def test_speech_windows():
    turnos = [
        ExtractedBlock("Primera idea del tema.", Location(start_seconds=s, end_seconds=s + 10),
                       BlockKind.SPEECH, (), "Ana")
        for s in (0, 10, 20, 30)
    ]
    reglas = ChunkingRules(target_chars=60, max_chars=200, overlap_chars=20, speech_max_seconds=240)
    fragmentos = StructureChunker(reglas).split(_document("nomina"), turnos)
    assert [f.location.start_seconds for f in fragmentos] == [0, 10, 20]
    assert all(f.kind == BlockKind.SPEECH and f.text.startswith("Ana: ") for f in fragmentos)


# ----------------------------------------------------------------------
# Encabezado de contexto y numeracion
# ----------------------------------------------------------------------
def test_context_header_includes_topic_and_path():
    bloques = [ExtractedBlock("Texto.", Location(page=4), BlockKind.TEXT, ("1. Intro", "1.1 Alcance"))]
    fragmento = StructureChunker(SMALL).split(_document(), bloques)[0]
    assert fragmento.context_header == "Activo fijo > Manual x > 1. Intro > 1.1 Alcance"
    assert build_context_header("Nomina", "Capacitacion 2026-09-07", ()) == "Nomina > Capacitacion 2026-09-07"


def test_ordinals_are_sequential():
    bloques = [ExtractedBlock(f"Texto {i}.", Location(page=i), BlockKind.TEXT, (f"S{i}",)) for i in range(5)]
    fragmentos = StructureChunker(SMALL).split(_document(), bloques)
    assert [f.ordinal for f in fragmentos] == list(range(5))
