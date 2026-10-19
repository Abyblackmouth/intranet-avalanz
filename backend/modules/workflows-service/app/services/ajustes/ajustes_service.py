"""Ajustes del modulo Workflows (clave/valor con historial).

Mismo patron que el panel de Ajustes del IT Service Desk: el catalogo AJUSTES
define cada ajuste (grupo, etiqueta, tipo, valores validos) y la pantalla se
dibuja a partir de el. Un ajuste nuevo es una entrada mas aqui.
"""
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ajuste, AjusteHistorial

AJUSTES: List[Dict[str, Any]] = [
    {"key": "correos.decision", "grupo": "Correos", "label": "Correo de decisión al solicitante",
     "descripcion": "Esperar a la plataforma: un solo correo cuando TOTVS confirme que aplicó el resultado (si no responde a tiempo, avisa que quedó pendiente). Al decidir: correo al terminar el flujo sin esperar a TOTVS. Ninguno: solo campana.",
     "tipo": "opcion", "default": "esperar_afectacion",
     "opciones": [["esperar_afectacion", "Esperar a la plataforma"], ["al_decidir", "Al decidir"], ["ninguno", "Ninguno"]]},
    {"key": "correos.espera_max_min", "grupo": "Correos", "label": "Minutos de espera antes de avisar que la plataforma no responde",
     "descripcion": "Solo aplica con «Esperar a la plataforma». Pasado este tiempo sin respuesta, el solicitante y TI reciben «aprobada, pendiente de aplicar».",
     "tipo": "int", "default": "10", "min": 1, "max": 1440},
    {"key": "correos.recibido", "grupo": "Correos", "label": "Acuse de recibido al solicitante",
     "descripcion": "Correo al solicitante cuando su trámite entra al flujo. Apagado por defecto: acaba de darle Guardar en la plataforma y ya lo sabe; la campana sí avisa siempre.",
     "tipo": "bool", "default": "false"},
    {"key": "correos.aprobador", "grupo": "Correos", "label": "Correo al aprobador cuando le toca",
     "descripcion": "Correo con la liga personal para decidir sin iniciar sesión. Si se apaga, el aprobador solo se entera por la campana y su Bandeja.",
     "tipo": "bool", "default": "true"},
    {"key": "folio.prefijo", "grupo": "Trámites", "label": "Prefijo del folio",
     "descripcion": "Los folios se arman como PREFIJO-FAMILIA-000001 (por ejemplo WF-AVAL-000001). Cambiarlo solo afecta a los trámites nuevos.",
     "tipo": "texto", "default": "WF", "max_len": 5},
    {"key": "folio.familia", "grupo": "Trámites", "label": "Familia del folio",
     "descripcion": "Parte del folio despues del prefijo (PREFIJO-FAMILIA-…). Es la de todo el módulo; cada empresa de una conexión puede tener la suya en Ajustes → Conexiones. Vacía: el folio no lleva familia.",
     "tipo": "texto", "default": "AVAL", "max_len": 6, "vacio_ok": True},
    {"key": "hoja.estilo", "grupo": "Apariencia", "label": "Estilo de la hoja del trámite",
     "descripcion": "Cómo se ve el documento en la página de aprobación, la Bandeja y la vista previa. Cada flujo puede usar otro estilo desde su Hoja.",
     "tipo": "opcion", "default": "flotante",
     "opciones": [["flotante", "Flotante"], ["neutro", "Neutro"], ["tinta", "Tinta"], ["arena", "Arena"], ["clasico", "Clásico"]]},
    {"key": "tokens.vigencia_dias", "grupo": "Trámites", "label": "Vigencia de la liga del correo (días)",
     "descripcion": "Días que sirve la liga personal del aprobador. Al reenviar el aviso se genera una nueva y la anterior se invalida.",
     "tipo": "int", "default": "30", "min": 1, "max": 365},
]
POR_KEY = {a["key"]: a for a in AJUSTES}


def normalizar(ajuste: Dict[str, Any], valor: Any) -> str:
    tipo = ajuste["tipo"]
    if tipo == "bool":
        if isinstance(valor, bool):
            return "true" if valor else "false"
        if str(valor).lower() in ("true", "false"):
            return str(valor).lower()
        raise HTTPException(status_code=422, detail="El valor debe ser verdadero o falso")
    if tipo == "int":
        try:
            n = int(valor)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="El valor debe ser un número entero")
        if not ajuste.get("min", n) <= n <= ajuste.get("max", n):
            raise HTTPException(status_code=422, detail=f"El valor debe estar entre {ajuste['min']} y {ajuste['max']}")
        return str(n)
    if tipo == "opcion":
        validos = [o[0] for o in ajuste["opciones"]]
        if str(valor) not in validos:
            raise HTTPException(status_code=422, detail=f"Opción no válida. Opciones: {', '.join(validos)}")
        return str(valor)
    if tipo == "texto":
        v = str(valor or "").strip().upper()
        if (not v and not ajuste.get("vacio_ok")) or len(v) > ajuste.get("max_len", 255) or (v and not v.replace("-", "").isalnum()):
            raise HTTPException(status_code=422, detail="Solo letras y números, sin espacios")
        return v
    raise HTTPException(status_code=500, detail="Tipo de ajuste desconocido")


async def valores(db: AsyncSession) -> Dict[str, str]:
    res = await db.execute(select(Ajuste.key, Ajuste.value))
    return {k: v for k, v in res.all()}


async def obtener(db: AsyncSession, key: str) -> str:
    """Valor vigente del ajuste (o su default). Lo usa el motor al momento de actuar."""
    ajuste = POR_KEY[key]
    res = await db.execute(select(Ajuste.value).where(Ajuste.key == key))
    v = res.scalar_one_or_none()
    return v if v is not None else ajuste["default"]


async def listar(db: AsyncSession) -> List[Dict[str, Any]]:
    actuales = await valores(db)
    return [{**a, "valor": actuales.get(a["key"], a["default"])} for a in AJUSTES]


async def historial(db: AsyncSession, limit: int = 40) -> List[Dict[str, Any]]:
    res = await db.execute(select(AjusteHistorial).order_by(AjusteHistorial.created_at.desc()).limit(limit))
    out = []
    for h in res.scalars().all():
        out.append({"key": h.key, "label": POR_KEY.get(h.key, {}).get("label", h.key), "anterior": h.valor_anterior,
                    "nuevo": h.valor_nuevo, "usuario": h.usuario_nombre, "fecha": h.created_at.isoformat()})
    return out


async def registrar_historial(db: AsyncSession, key: str, anterior: Optional[str], nuevo: str, user: Dict[str, Any]) -> None:
    """Cualquier cambio de configuracion del modulo pasa por aqui (ajustes, conexiones, usuarios).
    Los secretos nunca se mandan como valor: se registra 'cambiado'."""
    db.add(AjusteHistorial(key=key, valor_anterior=anterior, valor_nuevo=nuevo,
                           usuario_id=user.get("user_id"), usuario_nombre=user.get("full_name") or ""))


async def cambiar(db: AsyncSession, key: str, valor: Any, user: Dict[str, Any]) -> Dict[str, Any]:
    ajuste = POR_KEY.get(key)
    if not ajuste:
        raise HTTPException(status_code=404, detail="Ajuste no encontrado")
    nuevo = normalizar(ajuste, valor)
    anterior = (await valores(db)).get(key, ajuste["default"])
    if nuevo == anterior:
        return {"key": key, "valor": nuevo, "cambio": False}
    res = await db.execute(select(Ajuste).where(Ajuste.key == key))
    fila = res.scalar_one_or_none()
    if fila:
        fila.value = nuevo
        fila.updated_by = user.get("user_id")
        fila.updated_at = datetime.now(timezone.utc)
    else:
        db.add(Ajuste(key=key, value=nuevo, updated_by=user.get("user_id")))
    await registrar_historial(db, key, anterior, nuevo, user)
    await db.commit()
    return {"key": key, "valor": nuevo, "cambio": True}
