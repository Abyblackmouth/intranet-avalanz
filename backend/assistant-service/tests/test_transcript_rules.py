# ----------------------------------------------------------------------
# Pruebas de las reglas de transcripciones de Teams
# Casos tomados del formato real de las sesiones de capacitacion.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import pytest

from app.pipeline.loaders.transcript_rules import parse_teams_paragraph


# ----------------------------------------------------------------------
# Intervenciones reconocidas
# ----------------------------------------------------------------------
def test_turn_with_line_breaks():
    turn = parse_teams_paragraph("Renato Perrogon\n13:58\nOigan, con la pena del mundo")
    assert (turn.speaker, turn.seconds, turn.text) == ("Renato Perrogon", 838, "Oigan, con la pena del mundo")


def test_turn_with_spaces_and_no_separator():
    turn = parse_teams_paragraph("Edgar Horteales   8:43¿Cómo estás? Buenas tardes.")
    assert (turn.speaker, turn.seconds, turn.text) == ("Edgar Horteales", 523, "¿Cómo estás? Buenas tardes.")


def test_turn_with_hours():
    assert parse_teams_paragraph("Ana López 1:02:05 Revisemos el cálculo").seconds == 3725


def test_missing_space_after_period_is_fixed():
    assert parse_teams_paragraph("Marcela Rodriguez   8:56Sí.Claro.").text == "Sí. Claro."


# ----------------------------------------------------------------------
# Lineas que no son intervenciones
# ----------------------------------------------------------------------
@pytest.mark.parametrize("linea", [
    "Verus - Nómina - Prototipo (Certificación)-20260921_155015-Grabación de la reunión",
    "21 de septiembre de 2026, 9:50p.m.",
    "26 min 38 s",
    "Edgar Horteales ha iniciado la transcripción",
])
def test_header_lines_are_not_turns(linea):
    assert parse_teams_paragraph(linea) is None


def test_turn_without_text_is_discarded():
    assert parse_teams_paragraph("Marcela Rodriguez   9:01") is None
