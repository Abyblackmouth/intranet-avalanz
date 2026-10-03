# ----------------------------------------------------------------------
# Pruebas del ticket desde el chat: intencion y sugerencia de tipo
# ----------------------------------------------------------------------
import pytest

from app.adapters.rule_intents import RuleIntentDetector
from app.adapters.ticket_classifier import KeywordTicketClassifier

DETECTOR = RuleIntentDetector.from_file("data/intents.yaml")
CLASSIFIER = KeywordTicketClassifier.from_file("data/ticket_types.yaml")


@pytest.mark.parametrize("texto", [
    "quiero levantar un ticket", "levantar ticket", "necesito abrir un ticket",
    "¿cómo levanto un reporte?", "¿cómo abro un ticket?", "quiero reportar un problema", "reportar una falla",
])
def test_ticket_intent_opens_the_flow(texto):
    match = DETECTOR.detect(texto)
    assert match is not None and match.intent == "crear_ticket" and match.action == "open_ticket_flow"


@pytest.mark.parametrize("texto", ["necesito ayuda", "gracias", "¿cómo doy de baja un activo?"])
def test_other_messages_do_not_open_the_flow(texto):
    match = DETECTOR.detect(texto)
    assert match is None or match.intent != "crear_ticket"


@pytest.mark.parametrize("texto, tipo", [
    ("Me sale un error al timbrar la factura", "tecnico"),
    ("No puedo entrar al sistema, dice usuario bloqueado", "tecnico"),
    ("TOTVS está muy lento desde la mañana", "tecnico"),
    ("¿Cómo doy de baja un activo?", "funcional"),
    ("¿Dónde veo el reporte de saldos bancarios?", "funcional"),
    ("Necesito el folio de mi nómina", "funcional"),
])
def test_ticket_type_suggestion(texto, tipo):
    assert CLASSIFIER.suggest(texto)["reported_type"] == tipo


# ----------------------------------------------------------------------
# Sistema sugerido por el tema y "no le entiendo" como insatisfaccion
# ----------------------------------------------------------------------
@pytest.mark.parametrize("temas, sistema", [
    (["activo-fijo"], "TOTVS"), (["Activo fijo", "nomina"], "TOTVS"),
    (["crm-odoo-dyce"], "CRM Odoo DYCE"), (["roles"], None), ([], None),
])
def test_system_suggestion_by_topic(temas, sistema):
    assert CLASSIFIER.suggest("no se como dar de baja un activo", temas)["system"] == sistema


@pytest.mark.parametrize("texto", ["no le entiendo al manual", "no entiendo", "no me queda claro", "sigo sin entender el manual"])
def test_not_understanding_is_no_sirvio(texto):
    match = DETECTOR.detect(texto)
    assert match is not None and match.intent == "no_sirvio" and match.show_ticket


@pytest.mark.parametrize("texto", ["no entiendo como timbrar una factura", "no le entiendo al calculo del finiquito con fonacot"])
def test_real_questions_with_no_entiendo_are_searched(texto):
    assert DETECTOR.detect(texto) is None
