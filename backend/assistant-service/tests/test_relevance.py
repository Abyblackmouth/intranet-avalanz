# ----------------------------------------------------------------------
# Pruebas de las reglas de relevancia de la evaluacion
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from dataclasses import dataclass
from datetime import datetime

from app.domain.models import Chunk, Document, Location, SourceKind
from evaluation.relevance import is_relevant


@dataclass(frozen=True)
class _Q:
    document: str
    location: str
    answerable: bool = True


def _doc(name: str, kind: SourceKind) -> Document:
    ruta = f"it-service-desk/tema/{name}"
    return Document(Document.id_for(ruta), ruta, "it-service-desk", "tema", "t", kind, "", 1, datetime(2026, 1, 1))


def _chunk(location: Location, header: str = "") -> Chunk:
    return Chunk(document_id=Document.id_for("x"), ordinal=0, text="t", location=location, context_header=header)


# ----------------------------------------------------------------------
# PDF: la pagina anotada o hasta dos antes
# ----------------------------------------------------------------------
def test_pdf_page_with_tolerance():
    doc = _doc("m.pdf", SourceKind.PDF)
    assert is_relevant(_Q("m.pdf", "12"), doc, _chunk(Location(page=10)))
    assert not is_relevant(_Q("m.pdf", "12"), doc, _chunk(Location(page=9)))
    assert not is_relevant(_Q("m.pdf", "12"), doc, _chunk(Location(page=13)))


# ----------------------------------------------------------------------
# Word: la seccion anotada aparece en el encabezado de contexto
# ----------------------------------------------------------------------
def test_word_section():
    doc = _doc("m.docx", SourceKind.WORD)
    header = "Crm odoo dyce > Manual > 5. Mega escenario > 5.7 Confirmación del pedido de venta"
    assert is_relevant(_Q("m.docx", "5.7 Confirmación del pedido de venta"), doc, _chunk(Location(), header))
    assert not is_relevant(_Q("m.docx", "5.1 Concepto de contacto"), doc, _chunk(Location(), header))


# ----------------------------------------------------------------------
# PowerPoint: diapositiva exacta
# ----------------------------------------------------------------------
def test_pptx_slide():
    doc = _doc("p.pptx", SourceKind.POWERPOINT)
    assert is_relevant(_Q("p.pptx", "8"), doc, _chunk(Location(slide=8)))
    assert not is_relevant(_Q("p.pptx", "8"), doc, _chunk(Location(slide=9)))


# ----------------------------------------------------------------------
# Documento equivocado y preguntas sin respuesta nunca son relevantes
# ----------------------------------------------------------------------
def test_wrong_document_and_unanswerable():
    doc = _doc("m.pdf", SourceKind.PDF)
    assert not is_relevant(_Q("otro.pdf", "12"), doc, _chunk(Location(page=12)))
    assert not is_relevant(_Q("m.pdf", "12", answerable=False), doc, _chunk(Location(page=12)))


# ----------------------------------------------------------------------
# El mismo nombre de archivo existe en varios temas: solo cuenta el del
# tema de la pregunta
# ----------------------------------------------------------------------
def test_same_file_name_in_another_topic_is_not_relevant():
    from types import SimpleNamespace
    from app.domain.models import SourceKind
    chunk = _chunk(Location(page=12))
    pregunta = SimpleNamespace(answerable=True, document="m.pdf", location="12", topic="totvs-nomina")
    en_su_tema = SimpleNamespace(relative_path="it-service-desk/totvs-nomina/m.pdf", kind=SourceKind.PDF)
    en_otro_tema = SimpleNamespace(relative_path="it-service-desk/totvs-stock-costos/m.pdf", kind=SourceKind.PDF)
    assert is_relevant(pregunta, en_su_tema, chunk)
    assert not is_relevant(pregunta, en_otro_tema, chunk)
