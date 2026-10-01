"""Calculo de los limites de SLA.

Severidad 24/7 (is_24_7, hoy S1): horas naturales. Las demas: horas habiles,
de lunes a viernes de 9:00 a 19:00 en Monterrey (10 h, con la comida incluida),
sin el 1 de enero, el 16 de septiembre ni el 25 de diciembre."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Monterrey")
HORA_INICIO, HORA_FIN = 9, 19
FESTIVOS_FIJOS = {(1, 1), (9, 16), (12, 25)}   # (mes, dia): no se recorren


def es_habil(d: date) -> bool:
    return d.weekday() < 5 and (d.month, d.day) not in FESTIVOS_FIJOS


def sumar_minutos_habiles(inicio: datetime, minutos: float) -> datetime:
    """El momento en que se cumplen esos minutos contando solo horario habil."""
    t = inicio.astimezone(TZ)
    restante = float(minutos)
    while True:
        dia = t.date()
        siguiente = datetime.combine(dia + timedelta(days=1), time(HORA_INICIO), TZ)
        if not es_habil(dia):
            t = siguiente
            continue
        abre = datetime.combine(dia, time(HORA_INICIO), TZ)
        cierra = datetime.combine(dia, time(HORA_FIN), TZ)
        if t < abre:
            t = abre
        if t >= cierra:
            t = siguiente
            continue
        disponibles = (cierra - t).total_seconds() / 60
        if restante <= disponibles:
            return (t + timedelta(minutes=restante)).astimezone(timezone.utc)
        restante -= disponibles
        t = siguiente


def limites_sla(severidad, inicio: datetime) -> tuple[datetime, datetime]:
    """(limite de respuesta, limite de resolucion) para una severidad."""
    if severidad.is_24_7:
        return (inicio + timedelta(minutes=severidad.response_sla_minutes),
                inicio + timedelta(hours=severidad.resolution_sla_hours))
    return (sumar_minutos_habiles(inicio, severidad.response_sla_minutes),
            sumar_minutos_habiles(inicio, severidad.resolution_sla_hours * 60))
