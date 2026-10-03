# ----------------------------------------------------------------------
# Pruebas del dominio
# Corren sin base de datos ni modelos de IA: si alguna vez requieren algo
# mas que pytest, el dominio dejo de ser independiente.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import uuid

import pytest

from app.domain.models import (
    BlockKind,
    Chunk,
    Document,
    Location,
    format_timestamp,
    parse_source_path,
    title_from_filename,
)


# ----------------------------------------------------------------------
# Ubicacion: la cita usa el campo que aplique
# ----------------------------------------------------------------------
def test_location_label_prefers_time():
    assert Location(page=3, start_seconds=272).label() == "minuto 04:32"


def test_location_label_slide():
    assert Location(slide=7).label() == "diapositiva 7"


def test_location_label_page():
    assert Location(page=12).label() == "página 12"


def test_location_label_empty():
    assert Location().label() == ""


def test_format_timestamp_with_hours():
    assert format_timestamp(3725) == "1:02:05"


# ----------------------------------------------------------------------
# Convencion de carpetas: modulo/tema/archivo
# ----------------------------------------------------------------------
def test_parse_source_path_module_and_topic():
    assert parse_source_path("it-service-desk/nomina/manual.pdf") == ("it-service-desk", "nomina")


def test_parse_source_path_default_topic():
    assert parse_source_path("general/guia.pdf") == ("general", "general")


def test_parse_source_path_rejects_loose_file():
    with pytest.raises(ValueError):
        parse_source_path("archivo.pdf")


# ----------------------------------------------------------------------
# Titulos legibles
# ----------------------------------------------------------------------
def test_title_from_manual():
    assert title_from_filename("manual-autocapacitacion-nomina-v2.pdf") == "Manual autocapacitacion nomina v2"


def test_title_from_transcript_keeps_date():
    assert title_from_filename("capacitacion-2026-09-07.transcripcion.docx") == "Capacitacion 2026-09-07"


# ----------------------------------------------------------------------
# Identificadores deterministas
# ----------------------------------------------------------------------
def test_document_id_is_stable_per_path():
    ruta = "it-service-desk/nomina/manual.pdf"
    assert Document.id_for(ruta) == Document.id_for(ruta)
    assert Document.id_for(ruta) != Document.id_for("it-service-desk/nomina/otro.pdf")


def test_chunk_id_is_stable():
    doc_id = uuid.uuid4()
    a = Chunk(document_id=doc_id, ordinal=0, text="x", location=Location())
    b = Chunk(document_id=doc_id, ordinal=0, text="y", location=Location())
    assert a.id == b.id


# ----------------------------------------------------------------------
# Texto para vectorizar: incluye el encabezado de contexto
# ----------------------------------------------------------------------
def test_chunk_embedding_text_includes_header():
    chunk = Chunk(
        document_id=uuid.uuid4(),
        ordinal=0,
        text="Se calcula sobre el salario diario.",
        location=Location(page=4),
        kind=BlockKind.TEXT,
        context_header="Manual nomina > Vacaciones",
    )
    assert chunk.embedding_text == "Manual nomina > Vacaciones\nSe calcula sobre el salario diario."
