# ----------------------------------------------------------------------
# Pruebas de la privacidad de los participantes
# ----------------------------------------------------------------------
from app.application.privacy import mask_participants, participantes_de

TRANSCRIPCION = ["Edgar Horteales: Estamos.\nKarla Garcia: Buenas tardes.\n"
                 "Raul Ramirez Hernandez: Hola, buenas tardes.\nContabilidad Sppel: Ya recibieron lo de compras?\n"
                 "Verónica Martínez: Sí."]
NOMBRES = participantes_de(TRANSCRIPCION)


def test_las_salas_no_son_personas():
    assert "Contabilidad Sppel" not in NOMBRES and "Karla Garcia" in NOMBRES


def test_quita_las_etiquetas():
    salida = mask_participants("Karla Garcia: Buenas tardes.", NOMBRES)
    assert salida == "• Buenas tardes." and "Karla" not in salida


def test_oculta_nombre_completo_primer_nombre_y_diminutivo():
    salida = mask_participants("Edgar Horteales: Gracias Karla, y Raul Ramirez lo revisa. Hola Vero.", NOMBRES)
    for nombre in ("Karla", "Raul", "Ramirez", "Vero", "Edgar"):
        assert nombre not in salida
    assert "[participante]" in salida


def test_no_toca_palabras_comunes_ni_las_salas():
    salida = mask_participants("Contabilidad Sppel: Vamos a revisar la Contabilidad del mes.", NOMBRES)
    assert "Contabilidad del mes" in salida and "Vamos" in salida
