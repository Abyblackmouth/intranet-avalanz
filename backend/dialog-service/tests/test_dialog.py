# ----------------------------------------------------------------------
# Pruebas del dialog-service: reglas leidas del YAML real y el caso de
# uso que decide entre platica y conocimiento
# ----------------------------------------------------------------------
import asyncio

import pytest

from app.adapters.rule_intents import RuleIntentDetector
from app.application.handle_message import HandleMessage

DETECTOR = RuleIntentDetector.from_file("data/intents.yaml")


@pytest.mark.parametrize("texto, intencion", [
    ("Hola", "saludo"), ("holaaa", "saludo"), ("¡Buenos días!", "saludo"), ("hola, ¿qué tal?", "saludo"),
    ("Gracias", "agradecimiento"), ("¡¡Muchísimas GRACIAS!!", "agradecimiento"), ("ok gracias", "agradecimiento"),
    ("gracias por tu ayuda", "agradecimiento"), ("gracias amigo", "agradecimiento"),
    ("adiós", "despedida"), ("eso es todo, gracias", "despedida"), ("gracias, hasta luego", "despedida"),
    ("¿Qué puedes hacer?", "capacidades"), ("¿quién eres?", "capacidades"), ("ayuda", "capacidades"),
    ("¿eres un robot?", "capacidades"),
    ("no me sirvió", "no_sirvio"), ("eso no me ayudó", "no_sirvio"), ("no es eso", "no_sirvio"),
    ("ok", "confirmacion"), ("perfecto", "confirmacion"), ("entendido", "confirmacion"),
])
def test_small_talk_is_recognized(texto, intencion):
    assert DETECTOR.detect(texto).intent == intencion


@pytest.mark.parametrize("texto", [
    "hola, ¿dónde veo los saldos bancarios?",
    "gracias, ¿y cómo cancelo una factura?",
    "necesito ayuda con la nómina",
    "¿Cómo doy de baja un activo?",
    "no me sale la opción de baja en el menú de activo fijo",
    "",
])
def test_questions_are_not_small_talk(texto):
    assert DETECTOR.detect(texto) is None


def test_only_no_sirvio_offers_ticket():
    assert DETECTOR.detect("no me sirvió").show_ticket is True
    assert DETECTOR.detect("gracias").show_ticket is False


class FakeKnowledge:
    def __init__(self):
        self.calls = []

    async def search(self, message, module, authorization):
        self.calls.append((message, module, authorization))
        return {"confidence": "alta", "overlap": 2, "results": [{"title": "Manual"}]}


def test_small_talk_does_not_call_knowledge():
    knowledge = FakeKnowledge()
    result = asyncio.run(HandleMessage(DETECTOR, knowledge).run("gracias", "it-service-desk", "Bearer x"))
    assert result["type"] == "conversacion" and result["reply"] and knowledge.calls == []


def test_questions_forward_the_token_to_knowledge():
    knowledge = FakeKnowledge()
    result = asyncio.run(HandleMessage(DETECTOR, knowledge).run("¿Cómo doy de baja un activo?", "it-service-desk", "Bearer x"))
    assert result["type"] == "busqueda" and result["results"] == [{"title": "Manual"}]
    assert knowledge.calls == [("¿Cómo doy de baja un activo?", "it-service-desk", "Bearer x")]


# ----------------------------------------------------------------------
# Tolerancia a errores de dedo: se reconocen variantes cercanas, pero las
# preguntas cortas reales no se confunden con platica
# ----------------------------------------------------------------------
@pytest.mark.parametrize("texto, intencion", [
    ("que reres ?", "capacidades"), ("grasias", "agradecimiento"), ("ola", "saludo"),
    ("graciaas", "agradecimiento"), ("buenos diass", "saludo"), ("hasta lugo", "despedida"),
])
def test_typos_are_tolerated(texto, intencion):
    assert DETECTOR.detect(texto).intent == intencion


@pytest.mark.parametrize("texto", ["que es ppd", "ppd", "baja", "nomina", "que es un mnemonico", "timbrado"])
def test_short_questions_stay_questions(texto):
    assert DETECTOR.detect(texto) is None
