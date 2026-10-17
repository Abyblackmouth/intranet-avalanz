"""Conectores por plataforma: saben autenticar, mandar el resultado y leer la respuesta de cada sistema.
Un flujo nunca habla con la plataforma directo."""
from app.models import Conexion
from app.plataformas.base import ConectorBase
from app.plataformas.totvs import ConectorTotvs

_REGISTRO = {"totvs": ConectorTotvs}


def conector_para(conexion: Conexion) -> ConectorBase:
    """Por slug; cualquier plataforma sin conector propio usa el generico (POST JSON con la autenticacion de la tarjeta)."""
    return _REGISTRO.get(conexion.slug, ConectorBase)(conexion)
