"""Hoja de un tramite concreto: junta instancia + flujo + archivos y llama a hoja.armar()."""
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Flujo, Instancia, InstanciaArchivo
from app.motor.hoja import armar


async def hoja_de(db: AsyncSession, inst: Instancia, con_urls: bool = True, cfg_override: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    flujo = (await db.execute(select(Flujo).where(Flujo.id == inst.flujo_id))).scalar_one_or_none()
    arch = (await db.execute(select(InstanciaArchivo).where(InstanciaArchivo.instancia_id == inst.id).order_by(InstanciaArchivo.uploaded_at))).scalars().all()
    archivos: List[Dict[str, Any]] = []
    for a in arch:
        url = None
        if con_urls:
            try:
                from app.motor.archivos import url_firmada
                url = url_firmada(a.object_key, a.bucket)
            except Exception:
                url = None
        archivos.append({"id": a.id, "nombre": a.original_name, "size_bytes": a.size_bytes, "url": url, "tipo": a.tipo})
    h = armar(cfg_override if cfg_override is not None else (flujo.hoja if flujo else None),
                 card_data=inst.card_data or {}, folio=inst.folio, flujo_nombre=flujo.nombre if flujo else inst.process_id,
                 company_name=inst.company_name, origen_clave=inst.origen_clave, company_group=inst.company_group, tenant_id=inst.tenant_id,
                 requester_nombre=inst.requester_nombre, status=inst.status, created_at=inst.created_at, archivos=archivos,
                 resumen_cfg=flujo.resumen if flujo else None)
    if not h.get("estilo"):
        from app.services.ajustes import ajustes_service
        h["estilo"] = await ajustes_service.obtener(db, "hoja.estilo")
    return h
