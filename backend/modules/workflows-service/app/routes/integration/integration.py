"""Integración: lo que llaman las plataformas (Protheus) con el token de su conexión.
Sin JWT de usuario: autentica el encabezado X-WF-Token contra la tarjeta de Conexiones.
Contrato en docs/modules/workflows/contexto-workflows.md, sección 6."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Conexion, Instancia, InstanciaEtapa
from app.motor import archivos as archivos_mod
from app.motor import instancias as motor
from app.services.ajustes.conexiones_service import validar_token_entrada

router = APIRouter(prefix="/integration", tags=["Integración"])


class Persona(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    login: Optional[str] = None
    name: str
    email: Optional[str] = None


class Archivo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    base64: str
    contentType: Optional[str] = None


class Sobre(BaseModel):
    """Un nombre por concepto, camelCase, singular. Lo que no esté aquí se rechaza con 400."""
    model_config = ConfigDict(extra="forbid")
    processId: str
    tenantId: str
    companyGroup: str
    companyName: Optional[str] = None
    resultService: str
    externalKey: str
    requester: Persona
    cardData: Dict[str, Any]
    files: List[Archivo] = []
    platform: Optional[str] = None   # opcional: si viene, debe coincidir con el slug de la conexión del token


def _errores(e: ValidationError) -> str:
    partes = []
    for err in e.errors():
        campo = ".".join(str(x) for x in err.get("loc", []))
        tipo = err.get("type", "")
        if tipo == "extra_forbidden":
            partes.append(f"«{campo}» no existe en el contrato")
        elif tipo == "missing":
            partes.append(f"falta «{campo}»")
        else:
            partes.append(f"«{campo}»: {err.get('msg')}")
    return "; ".join(partes)


async def conexion_por_token(db: AsyncSession, token: Optional[str]) -> Conexion:
    if not token:
        raise HTTPException(status_code=401, detail="Falta el encabezado X-WF-Token")
    for c in (await db.execute(select(Conexion))).scalars().all():
        if validar_token_entrada(c, token):
            if not c.activa:
                raise HTTPException(status_code=409, detail=f"La conexión {c.slug} está inactiva")
            return c
    raise HTTPException(status_code=401, detail="Token no válido")


@router.post("/instances", status_code=202)
async def recibir_sobre(request: Request, db: AsyncSession = Depends(get_db), x_wf_token: Optional[str] = Header(default=None)):
    conexion = await conexion_por_token(db, x_wf_token)
    try:
        cuerpo = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="El cuerpo no es JSON válido")
    try:
        sobre = Sobre.model_validate(cuerpo)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=_errores(e))
    if sobre.platform and sobre.platform.lower() != conexion.slug:
        raise HTTPException(status_code=400, detail=f"platform «{sobre.platform}» no corresponde al token (conexión {conexion.slug})")
    for campo in ("processId", "tenantId", "companyGroup", "resultService", "externalKey"):
        if not getattr(sobre, campo).strip():
            raise HTTPException(status_code=400, detail=f"«{campo}» viene vacío")
    if len(sobre.tenantId) < 2:
        raise HTTPException(status_code=400, detail="«tenantId» debe tener al menos 2 caracteres (empresa + filial)")
    # El flujo se valida antes de subir archivos, para no dejar basura en MinIO
    flujo = await motor.resolver_flujo(db, conexion, sobre.processId)
    datos = sobre.model_dump()
    origen_clave = f"{sobre.companyGroup}|{sobre.tenantId[:2]}"
    guardados = archivos_mod.guardar_sobre([a.model_dump() for a in sobre.files], conexion.slug, origen_clave, flujo.process_id, sobre.externalKey.replace("|", "-"))
    datos.pop("files", None)
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else None)
    r = await motor.recibir(db, conexion, datos, guardados, ip)
    inst: Instancia = r["instancia"]
    # Avisos (campana/correo) se enganchan aquí en el paso 6; el trámite ya está guardado.
    cuerpo_resp = {"instanceId": inst.id, "folio": inst.folio, "status": inst.status, "message": _mensaje(inst, r["nueva"])}
    if not r["nueva"]:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=200, content=cuerpo_resp)
    return cuerpo_resp


def _mensaje(inst: Instancia, nueva: bool) -> str:
    if not nueva:
        return "Ya existía un trámite abierto con esa externalKey y los mismos datos; se devuelve el existente"
    if inst.status == "error_configuracion":
        return f"Trámite creado, pero sin grupo de aprobación para la empresa {inst.origen_clave}: TI debe configurarlo en Flujos"
    return f"Trámite {inst.folio} en aprobación"


@router.get("/instances/{instance_id}")
async def consultar(instance_id: str, db: AsyncSession = Depends(get_db), x_wf_token: Optional[str] = Header(default=None)):
    """Para que la plataforma consulte el estado si quiere (el aviso de regreso sigue siendo lo principal)."""
    conexion = await conexion_por_token(db, x_wf_token)
    inst = (await db.execute(select(Instancia).where(Instancia.id == instance_id, Instancia.conexion_id == conexion.id))).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")
    etapas = (await db.execute(select(InstanciaEtapa).where(InstanciaEtapa.instancia_id == inst.id).order_by(InstanciaEtapa.orden))).scalars().all()
    return {"instanceId": inst.id, "folio": inst.folio, "externalKey": inst.external_key, "status": inst.status, "approved": inst.approved,
            "currentStep": inst.etapa_actual, "affectation": inst.afectacion, "platformMessage": inst.mensaje_plataforma,
            "steps": [{"step": e.orden, "stepName": e.nombre, "status": e.status, "approver": {"id": e.decidio_id_externo, "name": e.decidio_nombre or e.aprobador_nombre},
                       "date": e.decidio_en.isoformat() if e.decidio_en else None, "comment": e.comentario} for e in etapas]}


@router.get("/instances")
async def consultar_por_clave(externalKey: str, db: AsyncSession = Depends(get_db), x_wf_token: Optional[str] = Header(default=None)):
    conexion = await conexion_por_token(db, x_wf_token)
    insts = (await db.execute(select(Instancia).where(Instancia.conexion_id == conexion.id, Instancia.external_key == externalKey).order_by(Instancia.created_at.desc()))).scalars().all()
    return [{"instanceId": i.id, "folio": i.folio, "status": i.status, "approved": i.approved, "affectation": i.afectacion, "createdAt": i.created_at.isoformat()} for i in insts]
