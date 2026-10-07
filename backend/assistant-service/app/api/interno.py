"""Resumen de uso del asistente para el dashboard del IT Service Desk.

Solo para servicios internos: lo que entra por nginx trae X-Forwarded-For o
X-Real-IP y se rechaza. Las preguntas de baja confianza se agrupan cuando se
repiten (sin importar mayusculas, acentos ni signos) y se muestran como las
escribio la persona la ultima vez.
"""
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session

router = APIRouter(prefix="/internal", tags=["Interno"])


def _normaliza(t: str) -> str:
    t = unicodedata.normalize("NFKD", (t or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", t).split())


@router.get("/uso")
async def uso(desde: str, hasta: str, request: Request, session: AsyncSession = Depends(get_session)) -> Dict[str, Any]:
    if request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip"):
        raise HTTPException(status_code=404, detail="Not Found")
    d, h = datetime.fromisoformat(desde), datetime.fromisoformat(hasta)
    filas = (await session.execute(text("""
        select to_char(date_trunc('week', asked_at at time zone 'America/Monterrey'), 'YYYY-MM-DD') as semana,
               count(*) filter (where confidence = 'alta') as alta,
               count(*) filter (where confidence = 'media') as media,
               count(*) filter (where confidence = 'baja') as baja,
               count(*) filter (where escalated) as escaladas
        from query_log where asked_at >= :d and asked_at <= :h
        group by 1 order by 1"""), {"d": d, "h": h})).all()
    bajas = (await session.execute(text("""
        select question from query_log
        where confidence = 'baja' and asked_at >= :d and asked_at <= :h
        order by asked_at desc limit 500"""), {"d": d, "h": h})).all()
    grupos: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"tema": "", "preguntas": 0})
    for (q,) in bajas:
        g = grupos[_normaliza(q)]
        if not g["tema"]:
            g["tema"] = (q or "").strip()[:140]
        g["preguntas"] += 1
    semanas = [{"semana": r[0], "alta": r[1], "media": r[2], "baja": r[3], "escaladas": r[4]} for r in filas]
    return {
        "semanas": semanas,
        "total": sum(s["alta"] + s["media"] + s["baja"] for s in semanas),
        "total_baja": sum(s["baja"] for s in semanas),
        "sin_respuesta": sorted(grupos.values(), key=lambda g: -g["preguntas"])[:8],
    }
