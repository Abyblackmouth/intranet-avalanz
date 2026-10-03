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
