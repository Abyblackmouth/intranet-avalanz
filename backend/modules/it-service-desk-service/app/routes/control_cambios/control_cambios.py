"""Control de Cambios (CDC) -- proyectos/mejoras al ERP y sistemas
periféricos, distinto de Incidentes (fallas). Comparte la tabla
incidents (folio, estatus, fechas) pero guarda sus propios campos en
control_cambios_detalle, y su propia logica vive aqui, separada de
mesa_de_soporte.py."""

import uuid
from datetime import datetime, timezone, date
from io import BytesIO
from typing import Optional, List

import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "static", "logo_avalanz.png")

from app.database import get_db
from app.models.mesa_de_soporte import Incident, ControlCambiosDetalle, TicketSystem, TicketModule
from app.routes.mesa_de_soporte.mesa_de_soporte import (
    get_current_user, _get_requester_profile, _generate_folio, _broadcast_ticket_update,
)
from shared.middleware.jwt_validator import get_token_from_request

router = APIRouter(prefix="/control-cambios", tags=["Control de Cambios"])


def _generar_pdf_solicitud(datos: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=1*cm, bottomMargin=1*cm, leftMargin=2*cm, rightMargin=2*cm)
    styles = getSampleStyleSheet()
    titulo_style = ParagraphStyle('TituloCDC', parent=styles['Title'], fontSize=16, textColor=colors.HexColor('#1a4fa0'))
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#64748b'))
    valor_style = ParagraphStyle('Valor', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#1e293b'), spaceAfter=5)

    story = []
    if os.path.exists(LOGO_PATH):
        logo_img = Image(LOGO_PATH, width=4.65*cm, height=4.65*cm)
        logo_img.hAlign = 'LEFT'
        story.append(logo_img)
        story.append(Spacer(1, 6))
    story.append(Paragraph("Solicitud de Control de Cambios", titulo_style))
    story.append(Paragraph(f"Folio: {datos['folio']}", styles['Heading3']))
    story.append(Spacer(1, 8))

    def campo(label, valor):
        story.append(Paragraph(label.upper(), label_style))
        story.append(Paragraph(str(valor) if valor else "—", valor_style))

    campo("Fecha de solicitud", datos['fecha'])
    campo("Solicitante", datos['solicitante_nombre'])
    campo("Puesto", datos.get('solicitante_puesto') or "—")
    campo("Departamento", datos.get('solicitante_departamento') or "—")
    campo("Empresa", datos['empresa'])
    campo("Sistema / módulo afectado", datos['sistema_nombre'] + (f" / {datos['modulo_nombre']}" if datos.get('modulo_nombre') else ""))
    campo("Área / Departamento de la solicitud", datos['area'])
    campo("Tipo de solicitud", "Nueva funcionalidad" if datos['tipo_solicitud'] == 'nueva_funcionalidad' else "Mejora a funcionalidad existente")
    campo("Título", datos['titulo'])
    campo("Descripción detallada", datos['descripcion'])
    campo("Justificación / beneficio esperado", datos['justificacion'])
    campo("Impacto si no se realiza", datos['impacto'].capitalize())
    campo("Urgencia solicitada", datos['urgencia'].capitalize())
    if datos.get('fecha_requerida'):
        campo("Fecha requerida (deseada)", datos['fecha_requerida'])
    if datos.get('comentarios'):
        campo("Comentarios adicionales", datos['comentarios'])

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", color=colors.HexColor('#e2e8f0')))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "El solicitante confirmó que la información proporcionada es correcta y autorizó el trámite de este Control de Cambios.",
        ParagraphStyle('Responsiva', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#94a3b8'), spaceAfter=6)
    ))
    story.append(Paragraph(
        f"Correo del solicitante: {datos['solicitante_correo']}",
        ParagraphStyle('CorreoFooter', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#94a3b8'))
    ))

    doc.build(story)
    buf.seek(0)
    return buf.read()


async def _subir_archivo(file_bytes: bytes, filename: str, content_type: str, company_slug: str, submodule_slug: str, raw_token: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "http://upload-service:8000/api/v1/upload/",
                headers={"Authorization": f"Bearer {raw_token}"},
                files={"file": (filename, file_bytes, content_type)},
                data={"company_slug": company_slug, "module_slug": "it-service-desk", "submodule_slug": submodule_slug},
            )
            if resp.status_code == 200:
                return resp.json()["data"]["object_key"]
    except Exception:
        pass
    return None


def _hora_local(dt: datetime) -> datetime:
    """Convierte a hora de Monterrey. Si el contenedor no trae tzdata,
    cae a UTC-6 fijo (Mexico no tiene horario de verano desde 2022)."""
    try:
        from zoneinfo import ZoneInfo
        return dt.astimezone(ZoneInfo("America/Monterrey"))
    except Exception:
        from datetime import timedelta
        return dt.astimezone(timezone(timedelta(hours=-6)))


async def _build_cdc_pdf_data(db: AsyncSession, incident: Incident, detalle: ControlCambiosDetalle, solicitante_correo: str) -> dict:
    """Arma el diccionario que recibe _generar_pdf_solicitud a partir de lo
    ya guardado (incidente + detalle), no del body de la peticion. Asi lo
    reutilizan tanto la creacion como el correo de revision al PM, que corre
    despues en el consumidor de RabbitMQ sin acceso al body original -- y
    ambos producen exactamente el mismo documento."""
    sistema_nombre = "—"
    if detalle.system_id:
        res = await db.execute(select(TicketSystem).where(TicketSystem.id == detalle.system_id))
        sistema = res.scalar_one_or_none()
        sistema_nombre = sistema.name if sistema else "—"
    modulo_nombre = None
    if detalle.module_id:
        res = await db.execute(select(TicketModule).where(TicketModule.id == detalle.module_id))
        modulo = res.scalar_one_or_none()
        modulo_nombre = modulo.name if modulo else None

    return {
        "folio": incident.folio,
        "fecha": _hora_local(incident.created_at).strftime("%d/%m/%Y %H:%M"),
        "solicitante_nombre": incident.requester_name or "",
        "solicitante_correo": solicitante_correo or "",
        "solicitante_puesto": incident.requester_puesto,
        "solicitante_departamento": incident.requester_area,
        "empresa": incident.requester_company_name or "",
        "sistema_nombre": sistema_nombre,
        "modulo_nombre": modulo_nombre,
        "area": detalle.area_departamento,
        "tipo_solicitud": detalle.tipo_solicitud,
        "titulo": incident.title,
        "descripcion": incident.description,
        "justificacion": detalle.justificacion,
        "impacto": detalle.impacto_si_no_se_realiza,
        "urgencia": detalle.urgencia_solicitada,
        "fecha_requerida": detalle.fecha_requerida.isoformat() if detalle.fecha_requerida else None,
        "comentarios": detalle.comentarios_adicionales,
    }


class ControlCambioCreateRequest(BaseModel):
    system_id: str
    module_id: Optional[str] = None
    area_departamento: str
    tipo_solicitud: str
    titulo: str
    descripcion_detallada: str
    justificacion: str
    impacto_si_no_se_realiza: str
    urgencia_solicitada: str
    fecha_requerida: Optional[str] = None
    comentarios_adicionales: Optional[str] = None


@router.post("")
async def create_control_cambio(
    body: ControlCambioCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    raw_token: str = Depends(get_token_from_request),
):
    user_id = user.get("user_id")
    company_id = user.get("companies", [None])[0] if user.get("companies") else None
    if not company_id:
        raise HTTPException(status_code=400, detail="El usuario no tiene empresa asignada")

    profile = await _get_requester_profile(user_id)
    family_clave = profile.get("family_clave")
    company_slug = profile.get("company_slug")

    folio = await _generate_folio(db, "CDC", family_clave)
    now = datetime.now(timezone.utc)

    incident = Incident(
        id=str(uuid.uuid4()),
        folio=folio,
        ticket_type="control_cambio",
        title=body.titulo,
        company_id=company_id,
        requester_id=user_id,
        requester_name=profile.get("full_name", ""),
        requester_puesto=profile.get("puesto"),
        requester_area=profile.get("departamento"),
        requester_company_name=profile.get("company_name", ""),
        system_id=body.system_id,  # seleccion unica igual que Incidente: la tabla, filtros y busqueda lo leen de aqui
        module_id=body.module_id,
        reported_type=None,
        description=body.descripcion_detallada,
        severity_reported_id=None,
        status="en_backlog",  # cae al mismo backlog global de Incidente -- el motor lo procesa igual
        created_at=now,
    )
    db.add(incident)
    await db.flush()

    fecha_req_date = date.fromisoformat(body.fecha_requerida) if body.fecha_requerida else None

    detalle = ControlCambiosDetalle(
        incident_id=incident.id,
        system_id=body.system_id,
        module_id=body.module_id,
        area_departamento=body.area_departamento,
        tipo_solicitud=body.tipo_solicitud,
        justificacion=body.justificacion,
        impacto_si_no_se_realiza=body.impacto_si_no_se_realiza,
        urgencia_solicitada=body.urgencia_solicitada,
        fecha_requerida=fecha_req_date,
        comentarios_adicionales=body.comentarios_adicionales,
        created_at=now,
    )
    db.add(detalle)

    pdf_bytes = _generar_pdf_solicitud(
        await _build_cdc_pdf_data(db, incident, detalle, profile.get("email", ""))
    )

    fecha_str = _hora_local(now).strftime("%Y%m%d_%H%M%S")
    pdf_filename = f"SOLICITUD_{folio}_{fecha_str}.pdf"
    submodule = f"control-de-cambios/{folio}"

    object_key = await _subir_archivo(pdf_bytes, pdf_filename, "application/pdf", company_slug, submodule, raw_token)
    if object_key:
        detalle.solicitud_pdf_object_key = object_key

    await db.commit()

    await _broadcast_ticket_update(incident, event_type="it_service_desk.ticket_created")

    try:
        from app.rabbitmq import publish_incident_created
        await publish_incident_created(str(incident.id))
    except Exception:
        # Si RabbitMQ no esta disponible, el ticket ya se guardo bien --
        # se queda en_backlog para asignacion manual, no se pierde nada.
        pass

    return {
        "success": True,
        "message": "Control de Cambios registrado",
        "data": {"id": incident.id, "folio": folio, "status": incident.status},
    }


@router.post("/{incident_id}/evidencia")
async def upload_evidencia_registro(
    incident_id: str,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    raw_token: str = Depends(get_token_from_request),
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio")
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Control de Cambios no encontrado")

    profile = await _get_requester_profile(user.get("user_id"))
    company_slug = profile.get("company_slug")
    submodule = f"control-de-cambios/{incident.folio}/evidencias_registro"

    subidos = []
    for f in files:
        content = await f.read()
        object_key = await _subir_archivo(content, f.filename, f.content_type or "application/octet-stream", company_slug, submodule, raw_token)
        if object_key:
            subidos.append(object_key)

    return {"success": True, "evidencias_subidas": subidos, "total": len(subidos)}


# ------------------------------------------------------------------
# Catalogo de departamentos -- para el selector del formulario.
# Puente hacia admin-service (fuente real de verdad, se llenan al
# dar de alta empleados), no se duplica la consulta aqui.
# ------------------------------------------------------------------

@router.get("/departamentos")
async def list_departamentos(user: dict = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("http://admin-service:8000/internal/departamentos")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {"data": []}


# ------------------------------------------------------------------
# Perfil del solicitante -- puesto, departamento, empresa. El AuthUser
# del frontend (derivado del JWT) no trae estos campos, solo el
# company_id, asi que se piden a admin-service via el mismo perfil
# interno que ya usa create_control_cambio.
# ------------------------------------------------------------------

@router.get("/mi-perfil")
async def get_mi_perfil(user: dict = Depends(get_current_user)):
    try:
        profile = await _get_requester_profile(user.get("user_id"))
        return {
            "data": {
                "puesto": profile.get("puesto"),
                "departamento": profile.get("departamento"),
                "company_name": profile.get("company_name"),
            }
        }
    except Exception:
        return {"data": {}}


# ------------------------------------------------------------------
# Detalle de un Control de Cambios
# Va al final del archivo a proposito: /{incident_id} debe registrarse
# despues de /departamentos y /mi-perfil para no capturarlas.
# ------------------------------------------------------------------

CDC_MANAGER_ROLES = {"it-service-desk:incident-manager", "it-service-desk:project-manager", "super_admin"}


@router.get("/{incident_id}")
async def get_control_cambio_detail(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import IncidentAttachment, IncidentActivityLog
    from app.routes.mesa_de_soporte.mesa_de_soporte import MODULE_WIDE_ROLES

    result = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Control de Cambios no encontrado")

    # Mismas reglas de lectura que el detalle de Incidente
    roles = set(user.get("roles") or [])
    is_module_wide = bool(roles & MODULE_WIDE_ROLES) or "super_admin" in roles
    is_owner = incident.requester_id == user.get("user_id")
    if not is_module_wide and not is_owner:
        if "it-service-desk:jefe-empresa" in roles:
            if incident.company_id not in (user.get("companies") or []):
                raise HTTPException(status_code=403, detail="No tienes acceso a este proyecto")
        else:
            raise HTTPException(status_code=403, detail="No tienes acceso a este proyecto")

    det_result = await db.execute(select(ControlCambiosDetalle).where(ControlCambiosDetalle.incident_id == incident_id))
    detalle = det_result.scalar_one_or_none()

    system_name, module_name = None, None
    system_id = incident.system_id or (detalle.system_id if detalle else None)
    module_id = incident.module_id or (detalle.module_id if detalle else None)
    if system_id:
        res = await db.execute(select(TicketSystem).where(TicketSystem.id == system_id))
        s = res.scalar_one_or_none()
        system_name = s.name if s else None
    if module_id:
        res = await db.execute(select(TicketModule).where(TicketModule.id == module_id))
        m = res.scalar_one_or_none()
        module_name = m.name if m else None

    attach_result = await db.execute(select(IncidentAttachment).where(IncidentAttachment.incident_id == incident_id))
    attachments = attach_result.scalars().all()

    log_result = await db.execute(
        select(IncidentActivityLog).where(IncidentActivityLog.incident_id == incident_id).order_by(IncidentActivityLog.performed_at.desc())
    )
    logs = log_result.scalars().all()

    requester_profile = await _get_requester_profile(incident.requester_id)
    assignee_profile = await _get_requester_profile(incident.assigned_to_user_id) if incident.assigned_to_user_id else {}

    # Expediente: un documento por etapa (hoy solo la solicitud) + anexos
    documentos = []
    if detalle and detalle.solicitud_pdf_object_key:
        documentos.append({
            "tipo": "solicitud", "etapa": "registrado",
            "nombre": f"SOLICITUD_{incident.folio}.pdf",
            "object_key": detalle.solicitud_pdf_object_key, "bucket": "dirdoc",
            "fecha": incident.created_at.isoformat(),
        })
    for a in attachments:
        documentos.append({
            "tipo": "anexo", "etapa": a.attachment_type,
            "nombre": a.object_key.rsplit("/", 1)[-1],
            "object_key": a.object_key, "bucket": a.bucket, "mime_type": a.mime_type,
            "fecha": None,
        })

    from app.models.mesa_de_soporte import ControlCambiosEtapa
    etapas_result = await db.execute(
        select(ControlCambiosEtapa).where(ControlCambiosEtapa.incident_id == incident_id).order_by(ControlCambiosEtapa.created_at)
    )
    etapas = etapas_result.scalars().all()
    for e in etapas:
        if e.documento_object_key:
            documentos.append({
                "tipo": "dictamen" if e.etapa == "en_revision" else "etapa", "etapa": e.etapa,
                "nombre": f'{ {"en_revision": "DICTAMEN", "priorizado": "PRIORIZACION"}.get(e.etapa, e.etapa.upper())}_{incident.folio}.pdf',
                "object_key": e.documento_object_key, "bucket": "dirdoc", "fecha": e.created_at.isoformat(),
            })
        for a in (e.anexos or []):
            documentos.append({
                "tipo": "anexo", "etapa": e.etapa, "nombre": a.get("nombre"),
                "object_key": a.get("object_key"), "bucket": a.get("bucket", "dirdoc"), "fecha": e.created_at.isoformat(),
            })
    from app.models.mesa_de_soporte import ControlCambiosDocumento
    docs_result = await db.execute(
        select(ControlCambiosDocumento).where(
            ControlCambiosDocumento.incident_id == incident_id,
            ControlCambiosDocumento.estado.in_(["generado", "subido"]),
        ).order_by(ControlCambiosDocumento.created_at)
    )
    for doc in docs_result.scalars().all():
        if doc.object_key:
            documentos.append({
                "tipo": "arranque", "etapa": {"diseno_funcional": "en_diseno_funcional", "diseno_tecnico": "en_diseno_tecnico", "entrega_pruebas": "en_desarrollo"}.get(doc.tipo, "en_arranque"), "nombre": doc.nombre,
                "object_key": doc.object_key, "bucket": "dirdoc", "fecha": doc.created_at.isoformat(),
            })

    ajuste_pendiente = any(
        e.etapa == "en_revision" and e.resultado == "ajuste_alcance" and (e.datos or {}).get("ajuste_estado") == "pendiente"
        for e in etapas
    )

    return {
        "id": incident.id, "folio": incident.folio, "title": incident.title,
        "description": incident.description, "status": incident.status,
        "created_at": incident.created_at.isoformat(),
        "sla_resolution_limit": incident.sla_resolution_limit.isoformat() if incident.sla_resolution_limit else None,
        "requester": {
            "id": incident.requester_id, "name": incident.requester_name,
            "email": requester_profile.get("email"), "puesto": incident.requester_puesto,
            "area": incident.requester_area, "company_name": incident.requester_company_name,
            "photo_object_key": requester_profile.get("photo_object_key"),
        },
        "assigned_to": {
            "id": incident.assigned_to_user_id, "name": assignee_profile.get("full_name"),
            "puesto": assignee_profile.get("puesto"),
            "assigned_at": incident.assigned_at.isoformat() if incident.assigned_at else None,
        } if incident.assigned_to_user_id else None,
        "detalle": {
            "system_id": system_id, "system_name": system_name,
            "module_id": module_id, "module_name": module_name,
            "area_departamento": detalle.area_departamento if detalle else None,
            "tipo_solicitud": detalle.tipo_solicitud if detalle else None,
            "justificacion": detalle.justificacion if detalle else None,
            "impacto_si_no_se_realiza": detalle.impacto_si_no_se_realiza if detalle else None,
            "urgencia_solicitada": detalle.urgencia_solicitada if detalle else None,
            "fecha_requerida": detalle.fecha_requerida.isoformat() if detalle and detalle.fecha_requerida else None,
            "comentarios_adicionales": detalle.comentarios_adicionales if detalle else None,
            "prioridad": detalle.prioridad if detalle else None,
            "clasificacion": detalle.clasificacion if detalle else None,
            "project_manager": {"id": detalle.project_manager_id, "name": detalle.project_manager_nombre} if detalle and detalle.project_manager_id else None,
            "impacto_confirmado": detalle.impacto_confirmado if detalle else None,
            "fecha_compromiso": detalle.fecha_compromiso.isoformat() if detalle and detalle.fecha_compromiso else None,
        },
        "documentos": documentos,
        "activity_log": [
            {"action": l.action, "performed_by_name": l.performed_by_name, "performed_by_role": l.performed_by_role,
             "performed_at": l.performed_at.isoformat(), "detail": l.detail}
            for l in logs
        ],
        "etapas": [
            {"id": e.id, "etapa": e.etapa, "resultado": e.resultado, "datos": e.datos,
             "anexos": e.anexos or [], "documento_object_key": e.documento_object_key,
             "realizado_por_nombre": e.realizado_por_nombre, "created_at": e.created_at.isoformat()}
            for e in etapas
        ],
        "ajuste_pendiente": ajuste_pendiente,
        "can_manage": bool(roles & CDC_MANAGER_ROLES),
    }



# ------------------------------------------------------------------
# Etapa En revision: emitir dictamen
# ------------------------------------------------------------------

class SesionRevision(BaseModel):
    fecha: str
    tipo: Optional[str] = None
    participantes: Optional[str] = None
    notas: str


class RevisionPayload(BaseModel):
    sesiones: list[SesionRevision] = []
    factibilidad: str
    impacto: str
    esfuerzo: str
    riesgos: Optional[str] = None
    resultado: str
    alcance_original: Optional[str] = None
    alcance_propuesto: Optional[str] = None
    motivo_ajuste: Optional[str] = None
    motivo_rechazo_categoria: Optional[str] = None
    motivo_rechazo: Optional[str] = None
    comentarios: Optional[str] = None


RESULTADOS_REVISION = {"procede", "ajuste_alcance", "no_procede"}
STATUS_POR_RESULTADO = {"procede": "aprobado", "no_procede": "rechazado", "ajuste_alcance": "en_revision"}
MAX_ANEXO_BYTES = 10 * 1024 * 1024


@router.post("/{incident_id}/revision")
async def emitir_dictamen_revision(
    incident_id: str,
    payload: str = Form(...),
    # Sin Optional a proposito: envuelto en Optional, FastAPI no lo detecta como
    # lista de archivos y entrega uno solo suelto (422 list_type)
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    raw_token: str = Depends(get_token_from_request),
):
    import json
    from pydantic import ValidationError
    from app.models.mesa_de_soporte import IncidentActivityLog, ControlCambiosEtapa
    from app.services.control_cambios.pdf_dictamen import generar_pdf_dictamen
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update

    roles = set(user.get("roles") or [])
    if not roles & CDC_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Solo Gerencia de Proyectos puede emitir el dictamen")

    try:
        body = RevisionPayload(**json.loads(payload))
    except (ValueError, ValidationError):
        raise HTTPException(status_code=422, detail="Los datos del dictamen no son validos")

    def req(value, msg):
        if not (value or "").strip():
            raise HTTPException(status_code=422, detail=msg)
    req(body.factibilidad, "Describe la factibilidad para emitir el dictamen")
    if body.impacto not in {"alto", "medio", "bajo"} or body.esfuerzo not in {"alto", "medio", "bajo"}:
        raise HTTPException(status_code=422, detail="Impacto y esfuerzo son obligatorios")
    if body.resultado not in RESULTADOS_REVISION:
        raise HTTPException(status_code=422, detail="Elige un dictamen")
    if body.resultado == "ajuste_alcance":
        req(body.alcance_propuesto, "Describe el alcance propuesto")
        req(body.motivo_ajuste, "Explica el motivo del ajuste")
    if body.resultado == "no_procede":
        req(body.motivo_rechazo_categoria, "Elige la categoria del rechazo")
        req(body.motivo_rechazo, "Explica al solicitante por que no procede")

    result = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Control de Cambios no encontrado")
    if incident.status != "en_revision":
        raise HTTPException(status_code=409, detail="El proyecto ya no esta en revision")

    pend = await db.execute(select(ControlCambiosEtapa).where(
        ControlCambiosEtapa.incident_id == incident_id, ControlCambiosEtapa.etapa == "en_revision",
        ControlCambiosEtapa.resultado == "ajuste_alcance"))
    if any((e.datos or {}).get("ajuste_estado") == "pendiente" for e in pend.scalars().all()):
        raise HTTPException(status_code=409, detail="Hay un ajuste de alcance esperando la aprobacion del solicitante")

    det = await db.execute(select(ControlCambiosDetalle).where(ControlCambiosDetalle.incident_id == incident_id))
    detalle = det.scalar_one_or_none()
    solicitante = await _get_requester_profile(incident.requester_id)
    company_slug = solicitante.get("company_slug")
    submodule = f"control-de-cambios/{incident.folio}"

    reviso_nombre = user.get("full_name") or "Gerencia de Proyectos"
    reviso_rol = ("project-manager" if "it-service-desk:project-manager" in roles
                  else "incident-manager" if "it-service-desk:incident-manager" in roles else "super_admin")
    reviso_rol_label = {"project-manager": "Project Manager", "incident-manager": "Incident Manager"}.get(reviso_rol, "Administrador")
    now = datetime.now(timezone.utc)
    local = _hora_local(now)

    # Anexos de la etapa
    anexos = []
    for f in files or []:
        content = await f.read()
        if len(content) > MAX_ANEXO_BYTES:
            raise HTTPException(status_code=413, detail=f"{f.filename} excede 10 MB")
        key = await _subir_archivo(content, f.filename, f.content_type or "application/octet-stream", company_slug, submodule, raw_token)
        if not key:
            raise HTTPException(status_code=502, detail=f"No se pudo subir {f.filename}")
        anexos.append({"nombre": f.filename, "object_key": key, "bucket": "dirdoc", "mime_type": f.content_type})

    datos = body.model_dump()
    if body.resultado == "ajuste_alcance":
        datos["ajuste_estado"] = "pendiente"

    # Documento de la etapa
    alcance = "—"
    if detalle:
        pdf_base = await _build_cdc_pdf_data(db, incident, detalle, solicitante.get("email", ""))
        alcance = pdf_base["sistema_nombre"] + (f" / {pdf_base['modulo_nombre']}" if pdf_base.get("modulo_nombre") else "")
    pdf_bytes = generar_pdf_dictamen({
        **datos, "folio": incident.folio, "titulo": incident.title, "fecha_emision": local.strftime("%d/%m/%Y %H:%M"),
        "solicitante": " · ".join(filter(None, [incident.requester_name, incident.requester_area, incident.requester_company_name])),
        "solicitante_nombre": incident.requester_name, "alcance": alcance,
        "reviso": f"{reviso_nombre} · {reviso_rol_label}", "reviso_nombre": reviso_nombre, "reviso_rol": reviso_rol_label,
        "anexos": [a["nombre"] for a in anexos],
    })
    pdf_filename = f"DICTAMEN_{incident.folio}_{local.strftime('%Y%m%d_%H%M%S')}.pdf"
    pdf_key = await _subir_archivo(pdf_bytes, pdf_filename, "application/pdf", company_slug, submodule, raw_token)

    etapa = ControlCambiosEtapa(
        id=str(uuid.uuid4()), incident_id=incident.id, etapa="en_revision", resultado=body.resultado,
        datos=datos, documento_object_key=pdf_key, anexos=anexos,
        realizado_por=user.get("user_id"), realizado_por_nombre=reviso_nombre, created_at=now,
    )
    db.add(etapa)
    incident.status = STATUS_POR_RESULTADO[body.resultado]
    if body.resultado == "no_procede" and detalle and not detalle.prioridad:
        # Un rechazado nunca llega a priorizacion: se registra la urgencia que
        # indico el solicitante para que la tabla y el reporte no queden vacios
        detalle.prioridad = detalle.urgencia_solicitada
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_dictamen_emitido", performed_by=user.get("user_id"),
        performed_by_name=reviso_nombre, performed_by_role=reviso_rol, module_slug="it-service-desk",
        detail={"resultado": body.resultado, "etapa_id": etapa.id},
    ))
    await db.commit()

    await _broadcast_ticket_update(incident, extra={"cdc_prioridad": detalle.prioridad if detalle else None})

    # Notificar al solicitante (si falla, el dictamen ya quedo guardado)
    try:
        from app.assignment import _notify_inapp
        from app.services.control_cambios.notificaciones import send_cdc_dictamen_email, RESULTADO_LABEL
        await _notify_inapp(incident.requester_id, f"Dictamen de tu Control de Cambios #{incident.folio}",
                            RESULTADO_LABEL[body.resultado], "info", {"incident_id": str(incident.id), "folio": incident.folio})
        if solicitante.get("email"):
            await send_cdc_dictamen_email(solicitante["email"], incident.requester_name, incident.folio, incident.title,
                                          f"{reviso_nombre} · {reviso_rol_label}", datos, pdf_bytes, pdf_filename)
    except Exception as e:
        print(f"[CDC] Error notificando dictamen {incident.folio}: {e}")

    return {"success": True, "status": incident.status, "etapa_id": etapa.id}


# ------------------------------------------------------------------
# Etapa Priorizacion
# ------------------------------------------------------------------

PRIO_CODE = {"alta": "P1", "media": "P2", "baja": "P3"}
URGENCIA_LABEL = {"alta": "Alta", "media": "Media", "baja": "Baja"}
IMPACTO_LABEL = {"alto": "Alto", "medio": "Medio", "bajo": "Bajo"}
DESARROLLA_LABEL = {"equipo_interno": "Equipo interno", "proveedor_totvs": "Proveedor TOTVS", "proveedor_externo": "Proveedor externo"}
CLASIFICACION_LABEL = {"cambio": "Cambio", "proyecto": "Proyecto"}
ROLES_GOBIERNO = {"patrocinador": "Patrocinador", "gerente_proyecto": "Gerente del proyecto", "project_manager": "Project Manager",
                  "lider_tecnico": "Líder técnico", "validador": "Usuario validador"}
CAMPOS_A_CONFIRMAR = ("urgencia", "impacto", "fecha")


class PriorizacionPayload(BaseModel):
    urgencia: str
    impacto: str
    fecha_compromiso: str
    confirmaciones: dict[str, str]
    desarrolla: str
    responsable_desarrollo: Optional[str] = None
    notas_comite: Optional[str] = None
    clasificacion: str = ""
    gobierno: Optional[dict[str, dict]] = None


def _fin_de_dia_local(d) -> datetime:
    """23:59:59 hora de Monterrey del dia comprometido, en UTC -- es el
    limite de SLA del CDC a partir de la priorizacion."""
    from datetime import time as dtime, timedelta
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("America/Monterrey")
    except Exception:
        tz = timezone(timedelta(hours=-6))
    return datetime.combine(d, dtime(23, 59, 59), tzinfo=tz).astimezone(timezone.utc)


def _fecha_label(iso):
    if not iso:
        return "Sin fecha"
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


@router.post("/{incident_id}/priorizacion")
async def guardar_priorizacion(
    incident_id: str,
    payload: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    raw_token: str = Depends(get_token_from_request),
):
    import json
    from pydantic import ValidationError
    from app.models.mesa_de_soporte import IncidentActivityLog, ControlCambiosEtapa
    from app.services.control_cambios.pdf_priorizacion import generar_pdf_priorizacion
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update

    roles = set(user.get("roles") or [])
    if not roles & CDC_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Solo Gerencia de Proyectos puede priorizar")

    try:
        body = PriorizacionPayload(**json.loads(payload))
    except (ValueError, ValidationError):
        raise HTTPException(status_code=422, detail="Los datos de la priorizacion no son validos")

    if body.urgencia not in PRIO_CODE:
        raise HTTPException(status_code=422, detail="Confirma la urgencia")
    if body.impacto not in IMPACTO_LABEL:
        raise HTTPException(status_code=422, detail="Confirma el impacto")
    if body.desarrolla not in DESARROLLA_LABEL:
        raise HTTPException(status_code=422, detail="Indica quien lo desarrolla")
    if body.clasificacion not in CLASIFICACION_LABEL:
        raise HTTPException(status_code=422, detail="Indica si se gestiona como Cambio o como Proyecto")
    if body.clasificacion == "proyecto":
        faltan = [lbl for key, lbl in ROLES_GOBIERNO.items() if not ((body.gobierno or {}).get(key) or {}).get("id")]
        if faltan:
            raise HTTPException(status_code=422, detail=f"Asigna los roles del proyecto: {', '.join(faltan)}")
    else:
        body.gobierno = None
    try:
        fecha = date.fromisoformat(body.fecha_compromiso)
    except ValueError:
        raise HTTPException(status_code=422, detail="La fecha comprometida no es valida")
    if fecha < _hora_local(datetime.now(timezone.utc)).date():
        raise HTTPException(status_code=422, detail="La fecha comprometida no puede ser anterior a hoy")
    for campo in CAMPOS_A_CONFIRMAR:
        if body.confirmaciones.get(campo) not in {"confirmado", "ajustado"}:
            raise HTTPException(status_code=422, detail=f"Confirma o ajusta el dato de {campo} que indico el solicitante")

    result = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Control de Cambios no encontrado")
    if incident.status != "aprobado":
        raise HTTPException(status_code=409, detail="Solo se puede priorizar un proyecto aprobado")
    det = await db.execute(select(ControlCambiosDetalle).where(ControlCambiosDetalle.incident_id == incident_id))
    detalle = det.scalar_one_or_none()
    if not detalle:
        raise HTTPException(status_code=409, detail="El proyecto no tiene detalle de solicitud")

    # Lo "confirmado" debe coincidir con lo que pidio el solicitante
    solicitado = {
        "urgencia": detalle.urgencia_solicitada, "impacto": detalle.impacto_si_no_se_realiza,
        "fecha": detalle.fecha_requerida.isoformat() if detalle.fecha_requerida else None,
    }
    definido = {"urgencia": body.urgencia, "impacto": body.impacto, "fecha": body.fecha_compromiso}
    for campo in CAMPOS_A_CONFIRMAR:
        if body.confirmaciones[campo] == "confirmado" and definido[campo] != solicitado[campo]:
            raise HTTPException(status_code=422, detail=f"El dato de {campo} se marco como confirmado pero no coincide con lo que indico el solicitante")

    solicitante = await _get_requester_profile(incident.requester_id)
    company_slug = solicitante.get("company_slug")
    submodule = f"control-de-cambios/{incident.folio}"
    reviso_nombre = user.get("full_name") or "Gerencia de Proyectos"
    reviso_rol = ("project-manager" if "it-service-desk:project-manager" in roles
                  else "incident-manager" if "it-service-desk:incident-manager" in roles else "super_admin")
    reviso_rol_label = {"project-manager": "Project Manager", "incident-manager": "Incident Manager"}.get(reviso_rol, "Administrador")
    now = datetime.now(timezone.utc)
    local = _hora_local(now)

    anexos = []
    for f in files:
        content = await f.read()
        if len(content) > MAX_ANEXO_BYTES:
            raise HTTPException(status_code=413, detail=f"{f.filename} excede 10 MB")
        key = await _subir_archivo(content, f.filename, f.content_type or "application/octet-stream", company_slug, submodule, raw_token)
        if not key:
            raise HTTPException(status_code=502, detail=f"No se pudo subir {f.filename}")
        anexos.append({"nombre": f.filename, "object_key": key, "bucket": "dirdoc", "mime_type": f.content_type})

    codigo = PRIO_CODE[body.urgencia]
    datos = {**body.model_dump(), "solicitado": solicitado, "prioridad_codigo": codigo}

    pdf_base = await _build_cdc_pdf_data(db, incident, detalle, solicitante.get("email", ""))
    alcance = pdf_base["sistema_nombre"] + (f" / {pdf_base['modulo_nombre']}" if pdf_base.get("modulo_nombre") else "")
    comparativo = [
        ("Urgencia", URGENCIA_LABEL.get(solicitado["urgencia"], "—"), URGENCIA_LABEL[body.urgencia], body.confirmaciones["urgencia"]),
        ("Impacto", IMPACTO_LABEL.get(solicitado["impacto"], "—"), IMPACTO_LABEL[body.impacto], body.confirmaciones["impacto"]),
        ("Fecha de entrega", _fecha_label(solicitado["fecha"]), _fecha_label(body.fecha_compromiso), body.confirmaciones["fecha"]),
    ]
    pdf_bytes = generar_pdf_priorizacion({
        "folio": incident.folio, "titulo": incident.title, "fecha_emision": local.strftime("%d/%m/%Y %H:%M"),
        "prioridad_codigo": codigo, "urgencia_label": URGENCIA_LABEL[body.urgencia],
        "fecha_compromiso_label": _fecha_label(body.fecha_compromiso),
        "solicitante": " · ".join(filter(None, [incident.requester_name, incident.requester_area, incident.requester_company_name])),
        "solicitante_nombre": incident.requester_name, "alcance": alcance,
        "desarrolla_label": DESARROLLA_LABEL[body.desarrolla], "responsable_desarrollo": body.responsable_desarrollo,
        "reviso": f"{reviso_nombre} · {reviso_rol_label}", "reviso_nombre": reviso_nombre, "reviso_rol": reviso_rol_label,
        "comparativo": comparativo, "notas_comite": body.notas_comite, "anexos": [a["nombre"] for a in anexos],
        "clasificacion_label": CLASIFICACION_LABEL[body.clasificacion],
        "gobierno": [(lbl, (body.gobierno or {}).get(key, {}).get("name", "—")) for key, lbl in ROLES_GOBIERNO.items()] if body.gobierno else None,
    })
    pdf_filename = f"PRIORIZACION_{incident.folio}_{local.strftime('%Y%m%d_%H%M%S')}.pdf"
    pdf_key = await _subir_archivo(pdf_bytes, pdf_filename, "application/pdf", company_slug, submodule, raw_token)

    etapa = ControlCambiosEtapa(
        id=str(uuid.uuid4()), incident_id=incident.id, etapa="priorizado", resultado=codigo,
        datos=datos, documento_object_key=pdf_key, anexos=anexos,
        realizado_por=user.get("user_id"), realizado_por_nombre=reviso_nombre, created_at=now,
    )
    db.add(etapa)
    detalle.prioridad = body.urgencia
    detalle.impacto_confirmado = body.impacto
    detalle.fecha_compromiso = fecha
    detalle.clasificacion = body.clasificacion
    incident.sla_resolution_limit = _fin_de_dia_local(fecha)   # aqui arranca el SLA del CDC
    incident.status = "priorizado"
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_priorizado", performed_by=user.get("user_id"),
        performed_by_name=reviso_nombre, performed_by_role=reviso_rol, module_slug="it-service-desk",
        detail={"prioridad": codigo, "fecha_compromiso": body.fecha_compromiso, "clasificacion": body.clasificacion, "etapa_id": etapa.id},
    ))
    await db.commit()

    await _broadcast_ticket_update(incident, extra={"cdc_prioridad": body.urgencia, "cdc_clasificacion": body.clasificacion})

    try:
        from app.assignment import _notify_inapp
        from app.services.control_cambios.notificaciones import send_cdc_priorizacion_email
        await _notify_inapp(incident.requester_id, f"Tu Control de Cambios #{incident.folio} fue priorizado",
                            f"Prioridad {codigo} · entrega {_fecha_label(body.fecha_compromiso)}", "info",
                            {"incident_id": str(incident.id), "folio": incident.folio})
        if solicitante.get("email"):
            await send_cdc_priorizacion_email(solicitante["email"], incident.requester_name, incident.folio, incident.title,
                                              f"{reviso_nombre} · {reviso_rol_label}", codigo, URGENCIA_LABEL[body.urgencia],
                                              _fecha_label(body.fecha_compromiso), DESARROLLA_LABEL[body.desarrolla],
                                              pdf_bytes, pdf_filename)
    except Exception as e:
        print(f"[CDC] Error notificando priorizacion {incident.folio}: {e}")

    return {"success": True, "status": incident.status, "etapa_id": etapa.id}



# ------------------------------------------------------------------
# Catalogos para formularios de CDC
# (dos segmentos a proposito: no choca con GET /{incident_id})
# ------------------------------------------------------------------

@router.get("/catalogos/usuarios")
async def buscar_usuarios_cdc(q: str = "", user: dict = Depends(get_current_user)):
    roles = set(user.get("roles") or [])
    if not roles & CDC_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Sin permiso para buscar usuarios")
    if len(q.strip()) < 2:
        return []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("http://admin-service:8000/internal/users/search", params={"q": q.strip(), "limit": 15})
        return resp.json() if resp.status_code == 200 else []
    except Exception:
        return []


# ------------------------------------------------------------------
# Etapa Arranque (status priorizado -> en_arranque -> en_desarrollo)
# ------------------------------------------------------------------

# Documentos que el sistema genera desde formulario, con su prefijo de archivo
DOC_TIPOS_FORMALES = {
    "acta": "ACTA_CONSTITUCION", "alcance": "ALCANCE", "resumen": "RESUMEN_EJECUTIVO_TECNICO",
    "plan_breve": "PLAN_ARRANQUE",
}
# Documentos que siempre se suben como archivo (no dependen del ajuste)
# El cronograma lo trabaja el PM en su herramienta (normalmente MS Project)
DOC_TIPOS_ARCHIVO = {"cronograma", "diagrama", "acta_firmada", "otro"}
DOC_LABEL = {
    "acta": "Acta de Constitución", "alcance": "Alcance del proyecto", "resumen": "Resumen ejecutivo y técnico",
    "cronograma": "Cronograma", "plan_breve": "Plan de arranque", "diagrama": "Diagrama",
    "acta_firmada": "Acta firmada", "otro": "Documento de soporte",
}
REQUISITOS_ARRANQUE = {
    "proyecto": ["acta", "alcance", "resumen", "cronograma", "acta_firmada"],
    "cambio": ["plan_breve"],
}
SETTING_DOC_PROPIO = "cdc.permitir_documento_propio"
MAX_DOC_BYTES = 20 * 1024 * 1024
# El navegador manda el MIME segun el software instalado (un .mpp sin Project
# llega como application/octet-stream). Se normaliza por extension para que
# upload-service reciba siempre un tipo especifico de su lista blanca.
MIME_POR_EXTENSION = {
    ".mpp": "application/vnd.ms-project", ".xml": "application/xml",
    ".vsd": "application/vnd.visio", ".vsdx": "application/vnd.ms-visio.drawing.main+xml",
    ".drawio": "application/vnd.jgraph.mxfile",
}


def _mime_por_extension(nombre: str, recibido: Optional[str]) -> str:
    ext = "." + nombre.rsplit(".", 1)[-1].lower() if nombre and "." in nombre else ""
    return MIME_POR_EXTENSION.get(ext) or recibido or "application/octet-stream"

# Generadores de PDF por tipo de documento. Cada entrega registra el suyo:
#   GENERADORES_ARRANQUE["plan_breve"] = async fn(db, incident, detalle, datos, version, emitido_por) -> bytes
GENERADORES_ARRANQUE: dict = {}


async def _get_setting(db: AsyncSession, key: str, default: str = "") -> str:
    """Lee un ajuste de incidencias_settings. Pensado para el futuro panel de
    ajustes del modulo: si la clave no existe, regresa el default."""
    from app.models.mesa_de_soporte import IncidenciaSetting
    res = await db.execute(select(IncidenciaSetting).where(IncidenciaSetting.key == key))
    row = res.scalar_one_or_none()
    return row.value if row else default


def _doc_json(d) -> dict:
    return {
        "id": d.id, "tipo": d.tipo, "label": DOC_LABEL.get(d.tipo, d.tipo), "version": d.version,
        "estado": d.estado, "origen": d.origen, "datos": d.datos, "nombre": d.nombre,
        "object_key": d.object_key, "bucket": "dirdoc", "mime_type": d.mime_type,
        "creado_por_nombre": d.creado_por_nombre,
        "created_at": d.created_at.isoformat(), "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


def _faltantes(clasificacion: Optional[str], docs: list) -> list:
    """Requisitos pendientes para iniciar desarrollo, segun la version vigente
    de cada tipo. Formales: generado (o subido si el ajuste lo permitio).
    Acta firmada: subida."""
    if clasificacion not in REQUISITOS_ARRANQUE:
        return ["clasificacion"]
    vigente = {}
    for d in docs:
        if d.tipo not in vigente or d.version > vigente[d.tipo].version:
            vigente[d.tipo] = d
    pendientes = []
    for tipo in REQUISITOS_ARRANQUE[clasificacion]:
        d = vigente.get(tipo)
        ok = d is not None and (d.estado == "subido" if tipo in DOC_TIPOS_ARCHIVO else d.estado in ("generado", "subido"))
        if not ok:
            pendientes.append(tipo)
    return pendientes


async def _cargar_cdc_arranque(db: AsyncSession, incident_id: str, user: dict, estados=("priorizado", "en_arranque")):
    roles = set(user.get("roles") or [])
    if not roles & CDC_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Solo Gerencia de Proyectos puede trabajar el arranque")
    res = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Control de Cambios no encontrado")
    if incident.status not in estados:
        raise HTTPException(status_code=409, detail="El proyecto no está en la etapa de Arranque")
    det = await db.execute(select(ControlCambiosDetalle).where(ControlCambiosDetalle.incident_id == incident_id))
    detalle = det.scalar_one_or_none()
    if not detalle:
        raise HTTPException(status_code=409, detail="El proyecto no tiene detalle de solicitud")
    return incident, detalle, roles


async def _docs_de(db: AsyncSession, incident_id: str) -> list:
    from app.models.mesa_de_soporte import ControlCambiosDocumento
    res = await db.execute(
        select(ControlCambiosDocumento).where(ControlCambiosDocumento.incident_id == incident_id)
        .order_by(ControlCambiosDocumento.tipo, ControlCambiosDocumento.version)
    )
    return list(res.scalars().all())


def _rol_de(roles: set) -> str:
    return ("project-manager" if "it-service-desk:project-manager" in roles
            else "incident-manager" if "it-service-desk:incident-manager" in roles else "super_admin")


async def _marcar_en_arranque(db: AsyncSession, incident, user: dict, roles: set) -> bool:
    """El primer documento guardado mueve el ticket de priorizado a
    en_arranque (columna Arranque del Kanban). Regresa True si cambio."""
    if incident.status != "priorizado":
        return False
    from app.models.mesa_de_soporte import IncidentActivityLog
    incident.status = "en_arranque"
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_arranque_iniciado", performed_by=user.get("user_id"),
        performed_by_name=user.get("full_name") or "Gerencia de Proyectos", performed_by_role=_rol_de(roles),
        module_slug="it-service-desk", detail={},
    ))
    return True


@router.get("/{incident_id}/arranque")
async def get_arranque(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    incident, detalle, _ = await _cargar_cdc_arranque(db, incident_id, user, estados=("priorizado", "en_arranque", "en_desarrollo", "en_pruebas", "terminado"))
    docs = await _docs_de(db, incident_id)
    return {
        "status": incident.status,
        "clasificacion": detalle.clasificacion,
        "requisitos": REQUISITOS_ARRANQUE.get(detalle.clasificacion, []),
        "faltantes": _faltantes(detalle.clasificacion, docs),
        "documentos": [_doc_json(d) for d in docs],
        "permitir_documento_propio": (await _get_setting(db, SETTING_DOC_PROPIO, "false")).lower() == "true",
        "formatos_disponibles": sorted(GENERADORES_ARRANQUE.keys()),
        "contexto": await _contexto_proyecto(db, incident, detalle),
    }


class ClasificacionPayload(BaseModel):
    clasificacion: str


@router.put("/{incident_id}/arranque/clasificacion")
async def set_clasificacion_arranque(incident_id: str, body: ClasificacionPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    """Solo para CDC priorizados antes de que existiera la clasificacion."""
    incident, detalle, _ = await _cargar_cdc_arranque(db, incident_id, user)
    if detalle.clasificacion:
        raise HTTPException(status_code=409, detail="El proyecto ya tiene clasificación")
    if body.clasificacion not in CLASIFICACION_LABEL:
        raise HTTPException(status_code=422, detail="Indica si se gestiona como Cambio o como Proyecto")
    detalle.clasificacion = body.clasificacion
    await db.commit()
    return {"success": True, "clasificacion": detalle.clasificacion}


class BorradorPayload(BaseModel):
    datos: dict


@router.put("/{incident_id}/arranque/{tipo}/borrador")
async def guardar_borrador_arranque(incident_id: str, tipo: str, body: BorradorPayload,
                                    db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import ControlCambiosDocumento
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    if tipo not in DOC_TIPOS_FORMALES:
        raise HTTPException(status_code=422, detail="Este documento no se captura por formulario")
    incident, detalle, roles = await _cargar_cdc_arranque(db, incident_id, user)
    if not detalle.clasificacion:
        raise HTTPException(status_code=409, detail="Clasifica el proyecto como Cambio o Proyecto antes de capturar documentos")

    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == tipo]
    ultimo = docs[-1] if docs else None
    if ultimo and ultimo.estado == "borrador":
        ultimo.datos = body.datos
        doc = ultimo
    else:
        doc = ControlCambiosDocumento(
            id=str(uuid.uuid4()), incident_id=incident.id, tipo=tipo,
            version=(ultimo.version + 1) if ultimo else 1, estado="borrador", origen="formulario",
            datos=body.datos, creado_por=user.get("user_id"), creado_por_nombre=user.get("full_name") or "Gerencia de Proyectos",
        )
        db.add(doc)
    cambio = await _marcar_en_arranque(db, incident, user, roles)
    await db.commit()
    await db.refresh(doc)
    if cambio:
        await _broadcast_ticket_update(incident)
    return _doc_json(doc)


@router.post("/{incident_id}/arranque/{tipo}/generar")
async def generar_documento_arranque(incident_id: str, tipo: str, db: AsyncSession = Depends(get_db),
                                     user: dict = Depends(get_current_user), raw_token: str = Depends(get_token_from_request)):
    from app.models.mesa_de_soporte import IncidentActivityLog
    if tipo not in DOC_TIPOS_FORMALES:
        raise HTTPException(status_code=422, detail="Este documento no se genera desde formulario")
    generador = GENERADORES_ARRANQUE.get(tipo)
    if not generador:
        raise HTTPException(status_code=501, detail=f"El formato de {DOC_LABEL[tipo]} se habilita en una entrega posterior")
    incident, detalle, roles = await _cargar_cdc_arranque(db, incident_id, user, estados=("en_arranque",))

    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == tipo]
    doc = docs[-1] if docs else None
    if not doc or doc.estado != "borrador":
        raise HTTPException(status_code=409, detail="No hay un borrador para generar")

    emitido_por = f"{user.get('full_name') or 'Gerencia de Proyectos'}"
    pdf_bytes = await generador(db, incident, detalle, doc.datos, doc.version, emitido_por)
    solicitante = await _get_requester_profile(incident.requester_id)
    nombre = f"{DOC_TIPOS_FORMALES[tipo]}_{incident.folio}_v{doc.version}.pdf"
    key = await _subir_archivo(pdf_bytes, nombre, "application/pdf", solicitante.get("company_slug"),
                               f"control-de-cambios/{incident.folio}", raw_token)
    if not key:
        raise HTTPException(status_code=502, detail="No se pudo guardar el PDF")
    doc.estado, doc.object_key, doc.nombre, doc.mime_type = "generado", key, nombre, "application/pdf"
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_documento_generado", performed_by=user.get("user_id"),
        performed_by_name=emitido_por, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"tipo": tipo, "version": doc.version, "documento_id": doc.id},
    ))
    await db.commit()
    await db.refresh(doc)
    return _doc_json(doc)


@router.post("/{incident_id}/arranque/{tipo}/archivo")
async def subir_documento_arranque(incident_id: str, tipo: str, file: UploadFile = File(...), descripcion: str = Form(""),
                                   fecha_fin: str = Form(""),
                                   db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user),
                                   raw_token: str = Depends(get_token_from_request)):
    from app.models.mesa_de_soporte import ControlCambiosDocumento, IncidentActivityLog
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    if tipo in DOC_TIPOS_FORMALES:
        if (await _get_setting(db, SETTING_DOC_PROPIO, "false")).lower() != "true":
            raise HTTPException(status_code=403, detail="Este documento se genera desde el formulario del sistema")
    elif tipo not in DOC_TIPOS_ARCHIVO:
        raise HTTPException(status_code=422, detail="Tipo de documento no válido")
    incident, detalle, roles = await _cargar_cdc_arranque(db, incident_id, user)

    fin_cronograma = None
    if tipo == "cronograma":
        # No se lee el .mpp: el PM indica el termino y con eso se valida contra el compromiso
        if not fecha_fin:
            raise HTTPException(status_code=422, detail="Indica la fecha de término según el cronograma")
        fin_cronograma = _parse_fecha(fecha_fin, "término del cronograma")
        if detalle.fecha_compromiso and fin_cronograma > detalle.fecha_compromiso:
            raise HTTPException(status_code=422, detail=f"El cronograma termina después de la entrega comprometida ({detalle.fecha_compromiso.strftime('%d/%m/%Y')})")

    content = await file.read()
    if len(content) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail=f"{file.filename} excede 20 MB")
    solicitante = await _get_requester_profile(incident.requester_id)
    mime = _mime_por_extension(file.filename, file.content_type)
    key = await _subir_archivo(content, file.filename, mime,
                               solicitante.get("company_slug"), f"control-de-cambios/{incident.folio}", raw_token)
    if not key:
        raise HTTPException(status_code=502, detail=f"No se pudo subir {file.filename}")

    previos = [d for d in await _docs_de(db, incident_id) if d.tipo == tipo]
    autor = user.get("full_name") or "Gerencia de Proyectos"
    doc = ControlCambiosDocumento(
        id=str(uuid.uuid4()), incident_id=incident.id, tipo=tipo,
        version=(previos[-1].version + 1) if previos else 1, estado="subido", origen="archivo",
        datos={k: v for k, v in {"descripcion": descripcion, "fecha_fin": fin_cronograma.isoformat() if fin_cronograma else None}.items() if v},
        nombre=file.filename, object_key=key,
        mime_type=mime, creado_por=user.get("user_id"), creado_por_nombre=autor,
    )
    db.add(doc)
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_documento_subido", performed_by=user.get("user_id"),
        performed_by_name=autor, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"tipo": tipo, "version": doc.version, "nombre": file.filename, "documento_id": doc.id},
    ))
    cambio = await _marcar_en_arranque(db, incident, user, roles)
    await db.commit()
    await db.refresh(doc)
    if cambio:
        await _broadcast_ticket_update(incident)
    return _doc_json(doc)


@router.post("/{incident_id}/arranque/cerrar")
async def cerrar_arranque(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import ControlCambiosEtapa, IncidentActivityLog
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    incident, detalle, roles = await _cargar_cdc_arranque(db, incident_id, user, estados=("en_arranque",))
    docs = await _docs_de(db, incident_id)
    pendientes = _faltantes(detalle.clasificacion, docs)
    if pendientes:
        nombres = ", ".join("clasificación" if p == "clasificacion" else DOC_LABEL.get(p, p) for p in pendientes)
        raise HTTPException(status_code=409, detail=f"Falta para iniciar desarrollo: {nombres}")

    autor = user.get("full_name") or "Gerencia de Proyectos"
    now = datetime.now(timezone.utc)
    vigentes = {}
    for d in docs:
        if d.estado in ("generado", "subido") and (d.tipo not in vigentes or d.version > vigentes[d.tipo]["version"]):
            vigentes[d.tipo] = {"id": d.id, "version": d.version, "nombre": d.nombre}
    db.add(ControlCambiosEtapa(
        id=str(uuid.uuid4()), incident_id=incident.id, etapa="en_arranque", resultado=detalle.clasificacion,
        datos={"documentos": vigentes}, documento_object_key=None, anexos=[],
        realizado_por=user.get("user_id"), realizado_por_nombre=autor, created_at=now,
    ))
    # El PM se guarda aparte: durante el diseno "Asignado" es el especialista
    ctx = await _contexto_proyecto(db, incident, detalle)
    pm = ctx["gobierno"].get("project_manager") or {}
    detalle.project_manager_id = pm.get("id") or incident.assigned_to_user_id
    detalle.project_manager_nombre = pm.get("name") or (await _nombre_usuario(detalle.project_manager_id) if detalle.project_manager_id else None)
    incident.status = FASES_DISENO["funcional"]["status"]
    asignacion = await _asignar_diseno(db, incident, detalle, "funcional")
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_arranque_cerrado", performed_by=user.get("user_id"),
        performed_by_name=autor, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"clasificacion": detalle.clasificacion, "asignado_a": asignacion.get("usuario_asignado"), "via": asignacion.get("via")},
    ))
    await db.commit()
    await _broadcast_ticket_update(incident)
    if asignacion.get("usuario_asignado"):
        await _notificar_diseno(incident, asignacion["usuario_asignado"], "funcional")
    return {"success": True, "status": incident.status, "asignacion": asignacion}


# ------------------------------------------------------------------
# Generadores de Arranque (se registran en GENERADORES_ARRANQUE)
# ------------------------------------------------------------------

def _parse_fecha(valor, campo: str):
    try:
        return date.fromisoformat(valor)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=f"La fecha de {campo} no es válida")


async def _base_pdf_arranque(db, incident, detalle, version: int, emitido_por: str) -> dict:
    solicitante = await _get_requester_profile(incident.requester_id)
    base = await _build_cdc_pdf_data(db, incident, detalle, solicitante.get("email", ""))
    return {
        "folio": incident.folio, "titulo": incident.title, "version": version,
        "fecha_emision": _hora_local(datetime.now(timezone.utc)).strftime("%d/%m/%Y %H:%M"),
        "solicitante": " · ".join(filter(None, [incident.requester_name, incident.requester_area, incident.requester_company_name])),
        "solicitante_nombre": incident.requester_name,
        "alcance": base["sistema_nombre"] + (f" / {base['modulo_nombre']}" if base.get("modulo_nombre") else ""),
        "prioridad": f"{PRIO_CODE.get(detalle.prioridad, '—')} · {URGENCIA_LABEL.get(detalle.prioridad, '—')}",
        "fecha_compromiso": detalle.fecha_compromiso,
        "fecha_compromiso_label": detalle.fecha_compromiso.strftime("%d/%m/%Y") if detalle.fecha_compromiso else "Sin fecha",
        "emitido_por": emitido_por,
    }


async def _gen_plan_breve(db, incident, detalle, datos: dict, version: int, emitido_por: str) -> bytes:
    from app.services.control_cambios.pdf_arranque import generar_pdf_plan_breve
    for campo, msg in (("fecha_inicio", "la fecha de inicio"), ("responsable", "el responsable"), ("objetivo", "el objetivo")):
        if not (datos.get(campo) or "").strip():
            raise HTTPException(status_code=422, detail=f"Falta {msg} del plan de arranque")
    inicio = _parse_fecha(datos["fecha_inicio"], "inicio")
    if detalle.fecha_compromiso and inicio > detalle.fecha_compromiso:
        raise HTTPException(status_code=422, detail="El inicio no puede ser posterior a la entrega comprometida")
    entregables = [e for e in (datos.get("entregables") or []) if (e.get("descripcion") or "").strip()]
    if not entregables:
        raise HTTPException(status_code=422, detail="Agrega al menos un entregable")
    for e in entregables:
        e["fecha_label"] = _parse_fecha(e["fecha"], "un entregable").strftime("%d/%m/%Y") if e.get("fecha") else None
    base = await _base_pdf_arranque(db, incident, detalle, version, emitido_por)
    return generar_pdf_plan_breve({
        **base, "fecha_inicio_label": inicio.strftime("%d/%m/%Y"), "responsable": datos["responsable"],
        "objetivo": datos["objetivo"], "entregables": entregables, "consideraciones": datos.get("consideraciones"),
    })


GENERADORES_ARRANQUE.update({"plan_breve": _gen_plan_breve})


# ------------------------------------------------------------------
# Paquete de Proyecto: Acta, Alcance y Resumen ejecutivo y tecnico
# ------------------------------------------------------------------

async def _contexto_proyecto(db, incident, detalle) -> dict:
    """Lo que ya se sabe del proyecto, para precargar los formularios y
    alimentar el acta: roles de la priorizacion, riesgos y alcance ajustado
    del dictamen."""
    from app.models.mesa_de_soporte import ControlCambiosEtapa
    res = await db.execute(select(ControlCambiosEtapa).where(ControlCambiosEtapa.incident_id == incident.id).order_by(ControlCambiosEtapa.created_at))
    etapas = res.scalars().all()
    prio = next((e for e in reversed(etapas) if e.etapa == "priorizado"), None)
    rev = next((e for e in reversed(etapas) if e.etapa == "en_revision"), None)
    rd = (rev.datos or {}) if rev else {}
    return {
        "titulo": incident.title, "folio": incident.folio, "descripcion": incident.description,
        "justificacion": detalle.justificacion,
        "area": incident.requester_area or detalle.area_departamento,
        "solicitante": {"nombre": incident.requester_name, "area": incident.requester_area, "empresa": incident.requester_company_name},
        "gobierno": ((prio.datos or {}).get("gobierno") or {}) if prio else {},
        "riesgos": rd.get("riesgos"),
        "alcance_propuesto": rd.get("alcance_propuesto") if rev and rev.resultado == "ajuste_alcance" else None,
        "fecha_compromiso": detalle.fecha_compromiso.isoformat() if detalle.fecha_compromiso else None,
    }


def _lista(valores) -> list:
    return [str(v).strip() for v in (valores or []) if str(v).strip()]


def _filas(filas, campos) -> list:
    """Filas de una tabla del formulario, sin las que vienen totalmente vacias."""
    out = []
    for f in filas or []:
        fila = {c: str(f.get(c) or "").strip() for c in campos}
        if any(fila.values()):
            out.append(fila)
    return out


async def _gen_acta(db, incident, detalle, datos: dict, version: int, emitido_por: str) -> bytes:
    from app.services.control_cambios.pdf_proyecto import generar_pdf_acta
    ctx = await _contexto_proyecto(db, incident, detalle)
    gob = ctx["gobierno"]
    faltan = [lbl for key, lbl in (("patrocinador", "Patrocinador"), ("gerente_proyecto", "Gerente del proyecto"), ("project_manager", "Project Manager"))
              if not (gob.get(key) or {}).get("name")]
    if faltan:
        raise HTTPException(status_code=409, detail=f"El acta requiere los roles definidos en la priorización: {', '.join(faltan)}")
    if not (datos.get("objetivo") or "").strip():
        raise HTTPException(status_code=422, detail="Falta el objetivo del proyecto")
    incluye = _lista(datos.get("incluye"))
    if not incluye:
        raise HTTPException(status_code=422, detail="Agrega al menos un punto dentro del alcance")
    stakeholders = [s for s in _filas(datos.get("stakeholders"), ("nombre", "rol", "area", "responsabilidad")) if s["nombre"] and s["rol"]]
    if not stakeholders:
        raise HTTPException(status_code=422, detail="Agrega al menos un stakeholder con nombre y rol")
    base = await _base_pdf_arranque(db, incident, detalle, version, emitido_por)
    return generar_pdf_acta({
        **base, "version_label": f"{version}.0", "codigo": (datos.get("codigo") or incident.folio).strip(),
        "patrocinador": gob["patrocinador"]["name"], "gerente": gob["gerente_proyecto"]["name"], "pm": gob["project_manager"]["name"],
        "area": (datos.get("area") or ctx["area"] or "—").strip(), "estado": (datos.get("estado") or "En planificación").strip(),
        "objetivo": datos["objetivo"].strip(), "incluye": incluye, "excluye": _lista(datos.get("excluye")),
        "stakeholders": stakeholders, "supuestos": _lista(datos.get("supuestos")), "restricciones": _lista(datos.get("restricciones")),
        "aprobaciones": [(gob["patrocinador"]["name"], "Patrocinador"), (gob["gerente_proyecto"]["name"], "Gerente del proyecto"),
                         (gob["project_manager"]["name"], "Project Manager")],
    })


async def _gen_alcance(db, incident, detalle, datos: dict, version: int, emitido_por: str) -> bytes:
    from app.services.control_cambios.pdf_proyecto import generar_pdf_alcance
    if not (datos.get("vision_general") or "").strip():
        raise HTTPException(status_code=422, detail="Falta la visión general del alcance")
    secciones = [s for s in _filas(datos.get("secciones"), ("titulo", "contenido")) if s["titulo"] and s["contenido"]]
    base = await _base_pdf_arranque(db, incident, detalle, version, emitido_por)
    return generar_pdf_alcance({**base, "version_label": f"{version}.0", "vision_general": datos["vision_general"].strip(), "secciones": secciones})


async def _gen_resumen(db, incident, detalle, datos: dict, version: int, emitido_por: str) -> bytes:
    from app.services.control_cambios.pdf_proyecto import generar_pdf_resumen
    componentes = _filas(datos.get("componentes"), ("categoria", "componente", "tecnologia", "funcion"))
    fases = _filas(datos.get("fases"), ("fase", "nombre", "componentes", "entregable"))
    infra = _filas(datos.get("infraestructura"), ("recurso", "especificacion", "proposito"))
    if not componentes and not fases:
        raise HTTPException(status_code=422, detail="Agrega al menos un componente o una fase de implementación")
    diagramas = [d.nombre for d in await _docs_de(db, incident.id) if d.tipo == "diagrama" and d.nombre]
    base = await _base_pdf_arranque(db, incident, detalle, version, emitido_por)
    return generar_pdf_resumen({
        **base, "version_label": f"{version}.0", "resumen": (datos.get("resumen") or "").strip(),
        "componentes": componentes, "arquitectura": (datos.get("arquitectura") or "").strip(), "diagramas": diagramas,
        "fases": fases, "infraestructura": infra,
    })


GENERADORES_ARRANQUE.update({"acta": _gen_acta, "alcance": _gen_alcance, "resumen": _gen_resumen})


# ------------------------------------------------------------------
# Etapas de Diseno funcional y Diseno tecnico
# (en_arranque -> en_diseno_funcional -> en_diseno_tecnico -> en_desarrollo)
# ------------------------------------------------------------------

FASES_DISENO = {
    "funcional": {"status": "en_diseno_funcional", "equipo": "especialista-funcional", "doc": "diseno_funcional",
                  "prefijo": "DOCUMENTO_REQUERIMIENTOS_FUNCIONALES", "label": "Diseño funcional", "asunto": "diseno funcional",
                  "rol_label": "Especialista funcional"},
    "tecnico": {"status": "en_diseno_tecnico", "equipo": "especialista-tecnico", "doc": "diseno_tecnico",
                "prefijo": "DOCUMENTO_DISENO_TECNICO", "label": "Diseño técnico", "asunto": "diseno tecnico",
                "rol_label": "Especialista técnico"},
}
FASE_POR_STATUS = {v["status"]: k for k, v in FASES_DISENO.items()}
DOC_LABEL.update({"diseno_funcional": "Documento de Requerimientos Funcionales", "diseno_tecnico": "Documento de Diseño Técnico"})
IM_ROLES = {"it-service-desk:incident-manager", "super_admin"}
GENERADORES_DISENO: dict = {}


async def _nombre_usuario(user_id: Optional[str]) -> str:
    if not user_id:
        return ""
    return (await _get_requester_profile(user_id)).get("full_name") or ""


async def _asignar_diseno(db, incident, detalle, fase: str) -> dict:
    from app.motor import resolve_cdc_design_assignment
    cfg = FASES_DISENO[fase]
    r = await resolve_cdc_design_assignment(db, cfg["equipo"], detalle.system_id or incident.system_id,
                                            detalle.module_id or incident.module_id, detalle.project_manager_id)
    if r.get("encontrado"):
        incident.assigned_to_user_id = r["usuario_asignado"]
        incident.assigned_team = None if r.get("via") == "project_manager" else cfg["equipo"]
        incident.assigned_at = datetime.now(timezone.utc)
    return r


async def _notificar_diseno(incident, user_id: str, fase: str) -> None:
    """Aviso in-app y por correo al responsable de una etapa de diseno.
    Si falla, la asignacion ya quedo guardada."""
    cfg = FASES_DISENO[fase]
    try:
        from app.assignment import _notify_inapp
        await _notify_inapp(user_id, f"Control de Cambios #{incident.folio}: {cfg['label']}", incident.title, "info",
                            {"incident_id": str(incident.id), "folio": incident.folio})
        perfil = await _get_requester_profile(user_id)
        if perfil.get("email"):
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post("http://email-service:8000/api/v1/email/system-notification", json={
                    "to_email": perfil["email"], "full_name": perfil.get("full_name", ""),
                    "subject": f"Control de Cambios {incident.folio} para {cfg['asunto']}",
                    "message": f"Se te asignó la etapa de {cfg['label']}. Realiza tus sesiones de entendimiento y genera el documento de la etapa desde la intranet.",
                    "fields": [{"label": "Folio", "value": incident.folio, "mono": True}, {"label": "Titulo", "value": incident.title, "mono": False}],
                    "alert_type": "info",
                })
    except Exception as e:
        print(f"[CDC] Error notificando {cfg['label']} {incident.folio}: {e}")


async def _cargar_cdc_diseno(db, incident_id: str, user: dict, fase: str, editar: bool = False):
    if fase not in FASES_DISENO:
        raise HTTPException(status_code=404, detail="Etapa no válida")
    from app.routes.mesa_de_soporte.mesa_de_soporte import MODULE_WIDE_ROLES
    res = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Control de Cambios no encontrado")
    det = await db.execute(select(ControlCambiosDetalle).where(ControlCambiosDetalle.incident_id == incident_id))
    detalle = det.scalar_one_or_none()
    roles = set(user.get("roles") or [])
    es_asignado = incident.assigned_to_user_id == user.get("user_id")
    en_etapa = incident.status == FASES_DISENO[fase]["status"]
    puede_editar = en_etapa and (es_asignado or bool(roles & IM_ROLES))
    if not (roles & MODULE_WIDE_ROLES or es_asignado or "super_admin" in roles):
        raise HTTPException(status_code=403, detail="No tienes acceso a este proyecto")
    if editar and not en_etapa:
        raise HTTPException(status_code=409, detail=f"El proyecto no está en {FASES_DISENO[fase]['label']}")
    if editar and not puede_editar:
        raise HTTPException(status_code=403, detail="Esta etapa la atiende el responsable asignado")
    return incident, detalle, roles, puede_editar


async def _rf_ids(db, incident_id: str) -> list:
    """IDs de requerimientos funcionales del documento funcional vigente."""
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == "diseno_funcional" and d.estado == "generado"]
    if not docs:
        return []
    return [r.get("id") for r in (docs[-1].datos or {}).get("requerimientos", []) if r.get("id")]


# Antes de /{incident_id}/diseno/{fase}: si no, "candidatos" se tomaria como fase
@router.get("/{incident_id}/diseno/candidatos")
async def candidatos_diseno(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.motor import _usuarios_activos
    roles = set(user.get("roles") or [])
    if not roles & IM_ROLES:
        raise HTTPException(status_code=403, detail="Solo el Incident Manager puede reasignar")
    res = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = res.scalar_one_or_none()
    if not incident or incident.status not in FASE_POR_STATUS:
        raise HTTPException(status_code=409, detail="El proyecto no está en una etapa de diseño")
    cfg = FASES_DISENO[FASE_POR_STATUS[incident.status]]
    salida = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        for slug, etiqueta in ((cfg["equipo"], cfg["rol_label"]), ("incident-manager", "Incident Manager")):
            resp = await client.get("http://admin-service:8000/internal/users/by-module-role",
                                    params={"module_slug": "it-service-desk", "role_slug": slug})
            for u in (resp.json() if resp.status_code == 200 else []):
                if not any(x["id"] == u["id"] for x in salida):
                    salida.append({"id": u["id"], "name": u["name"], "email": u.get("email"), "rol": etiqueta})
    return salida


class AsignarDisenoPayload(BaseModel):
    user_id: str


@router.patch("/{incident_id}/diseno/asignar")
async def reasignar_diseno(incident_id: str, body: AsignarDisenoPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import IncidentActivityLog
    from app.motor import _usuarios_activos
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    roles = set(user.get("roles") or [])
    if not roles & IM_ROLES:
        raise HTTPException(status_code=403, detail="Solo el Incident Manager puede reasignar")
    res = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = res.scalar_one_or_none()
    if not incident or incident.status not in FASE_POR_STATUS:
        raise HTTPException(status_code=409, detail="El proyecto no está en una etapa de diseño")
    fase = FASE_POR_STATUS[incident.status]
    cfg = FASES_DISENO[fase]
    validos = (await _usuarios_activos([cfg["equipo"], "incident-manager"])) or set()
    if body.user_id not in validos:
        raise HTTPException(status_code=422, detail=f"Solo se puede asignar a un {cfg['rol_label'].lower()} o Incident Manager activo")
    anterior = incident.assigned_to_user_id
    incident.assigned_to_user_id = body.user_id
    incident.assigned_team = cfg["equipo"]
    incident.assigned_at = datetime.now(timezone.utc)
    nombre = await _nombre_usuario(body.user_id)
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_diseno_reasignado", performed_by=user.get("user_id"),
        performed_by_name=user.get("full_name") or "Incident Manager", performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"fase": fase, "anterior": anterior, "nuevo": body.user_id, "nuevo_nombre": nombre},
    ))
    await db.commit()
    await _broadcast_ticket_update(incident)
    await _notificar_diseno(incident, body.user_id, fase)
    return {"success": True, "asignado": {"id": body.user_id, "name": nombre}}


@router.get("/{incident_id}/diseno/{fase}")
async def get_diseno(incident_id: str, fase: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    incident, detalle, roles, puede_editar = await _cargar_cdc_diseno(db, incident_id, user, fase)
    cfg = FASES_DISENO[fase]
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == cfg["doc"]]
    ctx = await _contexto_proyecto(db, incident, detalle)
    return {
        "fase": fase, "status": incident.status, "puede_editar": puede_editar,
        "puede_reasignar": bool(roles & IM_ROLES) and incident.status == cfg["status"],
        "responsable": {"id": incident.assigned_to_user_id, "name": await _nombre_usuario(incident.assigned_to_user_id)} if incident.assigned_to_user_id else None,
        "project_manager": {"id": detalle.project_manager_id, "name": detalle.project_manager_nombre} if detalle and detalle.project_manager_id else None,
        "documentos": [_doc_json(d) for d in docs],
        "rf_ids": await _rf_ids(db, incident_id) if fase == "tecnico" else [],
        "contexto": ctx,
    }


@router.put("/{incident_id}/diseno/{fase}/borrador")
async def borrador_diseno(incident_id: str, fase: str, body: BorradorPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import ControlCambiosDocumento
    incident, detalle, roles, _ = await _cargar_cdc_diseno(db, incident_id, user, fase, editar=True)
    tipo = FASES_DISENO[fase]["doc"]
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == tipo]
    ultimo = docs[-1] if docs else None
    if ultimo and ultimo.estado == "borrador":
        ultimo.datos = body.datos
        doc = ultimo
    else:
        doc = ControlCambiosDocumento(
            id=str(uuid.uuid4()), incident_id=incident.id, tipo=tipo, version=(ultimo.version + 1) if ultimo else 1,
            estado="borrador", origen="formulario", datos=body.datos,
            creado_por=user.get("user_id"), creado_por_nombre=user.get("full_name") or "",
        )
        db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_json(doc)


@router.post("/{incident_id}/diseno/{fase}/generar")
async def generar_diseno(incident_id: str, fase: str, db: AsyncSession = Depends(get_db),
                         user: dict = Depends(get_current_user), raw_token: str = Depends(get_token_from_request)):
    from app.models.mesa_de_soporte import IncidentActivityLog
    incident, detalle, roles, _ = await _cargar_cdc_diseno(db, incident_id, user, fase, editar=True)
    cfg = FASES_DISENO[fase]
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == cfg["doc"]]
    doc = docs[-1] if docs else None
    if not doc or doc.estado != "borrador":
        raise HTTPException(status_code=409, detail="No hay un borrador para generar")
    autor = user.get("full_name") or ""
    pdf_bytes = await GENERADORES_DISENO[fase](db, incident, detalle, doc.datos, doc.version, autor)
    solicitante = await _get_requester_profile(incident.requester_id)
    nombre = f"{cfg['prefijo']}_{incident.folio}_v{doc.version}.pdf"
    key = await _subir_archivo(pdf_bytes, nombre, "application/pdf", solicitante.get("company_slug"),
                               f"control-de-cambios/{incident.folio}", raw_token)
    if not key:
        raise HTTPException(status_code=502, detail="No se pudo guardar el PDF")
    doc.estado, doc.object_key, doc.nombre, doc.mime_type = "generado", key, nombre, "application/pdf"
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_documento_generado", performed_by=user.get("user_id"),
        performed_by_name=autor, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"tipo": cfg["doc"], "version": doc.version, "documento_id": doc.id},
    ))
    await db.commit()
    await db.refresh(doc)
    return _doc_json(doc)


@router.post("/{incident_id}/diseno/{fase}/cerrar")
async def cerrar_diseno(incident_id: str, fase: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import ControlCambiosEtapa, IncidentActivityLog
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    incident, detalle, roles, _ = await _cargar_cdc_diseno(db, incident_id, user, fase, editar=True)
    cfg = FASES_DISENO[fase]
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == cfg["doc"]]
    vigente = docs[-1] if docs else None
    if not vigente or vigente.estado != "generado":
        raise HTTPException(status_code=409, detail=f"Genera el {DOC_LABEL[cfg['doc']]} antes de cerrar la etapa")
    autor = user.get("full_name") or ""
    responsable = {"id": incident.assigned_to_user_id, "name": await _nombre_usuario(incident.assigned_to_user_id)}
    db.add(ControlCambiosEtapa(
        id=str(uuid.uuid4()), incident_id=incident.id, etapa=cfg["status"], resultado=fase,
        datos={"documento": {"id": vigente.id, "version": vigente.version, "nombre": vigente.nombre}, "responsable": responsable},
        documento_object_key=vigente.object_key, anexos=[],
        realizado_por=user.get("user_id"), realizado_por_nombre=autor, created_at=datetime.now(timezone.utc),
    ))
    if fase == "funcional":
        incident.status = FASES_DISENO["tecnico"]["status"]
        siguiente = await _asignar_diseno(db, incident, detalle, "tecnico")
    else:
        # Fin del diseno: el proyecto regresa al PM para el desarrollo
        incident.status = "en_desarrollo"
        incident.assigned_to_user_id = detalle.project_manager_id or incident.assigned_to_user_id
        incident.assigned_team = None
        incident.assigned_at = datetime.now(timezone.utc)
        siguiente = {"usuario_asignado": incident.assigned_to_user_id, "via": "project_manager"}
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_diseno_cerrado", performed_by=user.get("user_id"),
        performed_by_name=autor, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"fase": fase, "siguiente": siguiente.get("usuario_asignado"), "via": siguiente.get("via")},
    ))
    await db.commit()
    await _broadcast_ticket_update(incident)
    if fase == "funcional" and siguiente.get("usuario_asignado"):
        await _notificar_diseno(incident, siguiente["usuario_asignado"], "tecnico")
    return {"success": True, "status": incident.status, "siguiente": siguiente}


# ── Generadores de los documentos de diseno ──

def _sesiones_label(sesiones) -> list:
    out = []
    for s in sesiones or []:
        if not (s.get("notas") or "").strip():
            continue
        fecha = s.get("fecha") or ""
        try:
            fecha = date.fromisoformat(fecha).strftime("%d/%m/%Y")
        except (TypeError, ValueError):
            pass
        out.append({"fecha": fecha, "tipo": s.get("tipo") or "", "participantes": s.get("participantes") or "", "notas": s["notas"].strip()})
    return out


async def _base_diseno(db, incident, detalle, version, emitido_por) -> dict:
    base = await _base_pdf_arranque(db, incident, detalle, version, emitido_por)
    return {**base, "version_label": f"{version}.0", "responsable": emitido_por or "—", "pm": detalle.project_manager_nombre or "—"}


async def _gen_diseno_funcional(db, incident, detalle, datos: dict, version: int, emitido_por: str) -> bytes:
    from app.services.control_cambios.pdf_proyecto import generar_pdf_diseno_funcional
    if not (datos.get("proceso_propuesto") or "").strip():
        raise HTTPException(status_code=422, detail="Describe el proceso propuesto")
    reqs, vistos = [], set()
    for i, r in enumerate(_filas(datos.get("requerimientos"), ("id", "descripcion", "prioridad", "criterio")), 1):
        if not r["descripcion"]:
            continue
        if not r["criterio"]:
            raise HTTPException(status_code=422, detail=f"Falta el criterio de aceptación de {r['id'] or f'RF-{i:02d}'}")
        r["id"] = (r["id"] or f"RF-{i:02d}").upper()
        if r["id"] in vistos:
            raise HTTPException(status_code=422, detail=f"El ID {r['id']} está repetido")
        vistos.add(r["id"])
        reqs.append(r)
    if not reqs:
        raise HTTPException(status_code=422, detail="Agrega al menos un requerimiento funcional")
    base = await _base_diseno(db, incident, detalle, version, emitido_por)
    return generar_pdf_diseno_funcional({
        **base, "sesiones": _sesiones_label(datos.get("sesiones")),
        "objetivo": (datos.get("objetivo") or "").strip(), "proceso_actual": (datos.get("proceso_actual") or "").strip(),
        "proceso_propuesto": datos["proceso_propuesto"].strip(), "requerimientos": reqs,
        "reglas": _texto_o_lista(datos.get("reglas")), "pantallas": _texto_o_lista(datos.get("pantallas")),
    })


def _texto_o_lista(valor) -> str:
    """Campo de texto libre; los borradores anteriores lo guardaban como lista
    y se convierten a lineas con '-' para que salgan como vinetas."""
    if isinstance(valor, list):
        return "\n".join(f"- {x}" for x in _lista(valor))
    return (valor or "").strip()


async def _gen_diseno_tecnico(db, incident, detalle, datos: dict, version: int, emitido_por: str) -> bytes:
    from app.services.control_cambios.pdf_proyecto import generar_pdf_diseno_tecnico
    if not (datos.get("solucion") or "").strip():
        raise HTTPException(status_code=422, detail="Describe la solución técnica")
    rf_validos = set(await _rf_ids(db, incident.id))
    reqs = []
    for i, r in enumerate(_filas(datos.get("requerimientos"), ("id", "rf", "descripcion", "horas")), 1):
        if not r["descripcion"]:
            continue
        r["id"] = (r["id"] or f"RT-{i:02d}").upper()
        r["rf"] = r["rf"].upper()
        if not r["rf"]:
            raise HTTPException(status_code=422, detail=f"{r['id']} debe ligarse a un requerimiento funcional")
        if rf_validos and r["rf"] not in rf_validos:
            raise HTTPException(status_code=422, detail=f"{r['rf']} no existe en el documento funcional ({', '.join(sorted(rf_validos))})")
        try:
            r["horas"] = float(r["horas"]) if r["horas"] else None
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Las horas de {r['id']} no son un número")
        reqs.append(r)
    if not reqs:
        raise HTTPException(status_code=422, detail="Agrega al menos un requerimiento técnico")
    base = await _base_diseno(db, incident, detalle, version, emitido_por)
    return generar_pdf_diseno_tecnico({
        **base, "sesiones": _sesiones_label(datos.get("sesiones")), "solucion": datos["solucion"].strip(),
        "objetos": _filas(datos.get("objetos"), ("tipo", "nombre", "accion", "descripcion")),
        "integraciones": (datos.get("integraciones") or "").strip(), "requerimientos": reqs,
        "plan_pruebas": _texto_o_lista(datos.get("plan_pruebas")), "riesgos": (datos.get("riesgos") or "").strip(),
    })


GENERADORES_DISENO.update({"funcional": _gen_diseno_funcional, "tecnico": _gen_diseno_tecnico})


# ------------------------------------------------------------------
# Etapa En desarrollo (en_desarrollo -> en_pruebas)
# ------------------------------------------------------------------

ESTADOS_RT = {"pendiente", "en_progreso", "terminado"}
DOC_LABEL.update({"entrega_pruebas": "Nota de entrega a pruebas"})


async def _rts_diseno(db, incident_id: str) -> list:
    """Requerimientos tecnicos del documento de diseno tecnico vigente."""
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == "diseno_tecnico" and d.estado == "generado"]
    if not docs:
        return []
    out = []
    for i, r in enumerate((docs[-1].datos or {}).get("requerimientos", []), 1):
        if not (r.get("descripcion") or "").strip():
            continue
        try:
            horas = float(r["horas"]) if r.get("horas") not in (None, "") else None
        except (TypeError, ValueError):
            horas = None
        out.append({"id": (r.get("id") or f"RT-{i:02d}").strip().upper(), "rf": (r.get("rf") or "").strip().upper(),
                    "descripcion": r["descripcion"].strip(), "horas_estimadas": horas})
    return out


async def _criterios_funcionales(db, incident_id: str) -> list:
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == "diseno_funcional" and d.estado == "generado"]
    if not docs:
        return []
    return [{"id": (r.get("id") or f"RF-{i:02d}").strip().upper(), "descripcion": (r.get("descripcion") or "").strip(),
             "criterio": (r.get("criterio") or "").strip()}
            for i, r in enumerate((docs[-1].datos or {}).get("requerimientos", []), 1) if (r.get("descripcion") or "").strip()]


async def _avances_de(db, incident_id: str) -> list:
    from app.models.mesa_de_soporte import ControlCambiosAvance
    res = await db.execute(select(ControlCambiosAvance).where(ControlCambiosAvance.incident_id == incident_id).order_by(ControlCambiosAvance.created_at))
    return list(res.scalars().all())


def _rts_con_estado(rts: list, avances: list) -> list:
    """El estado vigente de cada RT es su ultimo renglon en la bitacora."""
    ultimo = {}
    for a in avances:
        if a.rt_id:
            ultimo[a.rt_id] = a
    out = []
    for r in rts:
        a = ultimo.get(r["id"])
        out.append({**r, "estado": a.estado if a else "pendiente", "horas_reales": a.horas if a else None,
                    "actualizado_por": a.autor_nombre if a else None, "actualizado_en": a.created_at.isoformat() if a else None})
    return out


async def _responsable_tecnico(db, incident_id: str) -> Optional[str]:
    from app.models.mesa_de_soporte import ControlCambiosEtapa
    res = await db.execute(select(ControlCambiosEtapa).where(ControlCambiosEtapa.incident_id == incident_id,
                                                            ControlCambiosEtapa.etapa == "en_diseno_tecnico").order_by(ControlCambiosEtapa.created_at))
    etapas = res.scalars().all()
    return ((etapas[-1].datos or {}).get("responsable") or {}).get("id") if etapas else None


async def _cargar_cdc_desarrollo(db, incident_id: str, user: dict, editar: bool = False):
    from app.routes.mesa_de_soporte.mesa_de_soporte import MODULE_WIDE_ROLES
    res = await db.execute(select(Incident).where(Incident.id == incident_id, Incident.ticket_type == "control_cambio"))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Control de Cambios no encontrado")
    det = await db.execute(select(ControlCambiosDetalle).where(ControlCambiosDetalle.incident_id == incident_id))
    detalle = det.scalar_one_or_none()
    roles = set(user.get("roles") or [])
    uid = user.get("user_id")
    tecnico_id = await _responsable_tecnico(db, incident_id)
    participantes = {x for x in (detalle.project_manager_id if detalle else None, incident.assigned_to_user_id, tecnico_id) if x}
    puede_editar = incident.status == "en_desarrollo" and (bool(roles & IM_ROLES) or uid in participantes)
    if not (roles & MODULE_WIDE_ROLES or uid in participantes or "super_admin" in roles):
        raise HTTPException(status_code=403, detail="No tienes acceso a este proyecto")
    if editar and incident.status != "en_desarrollo":
        raise HTTPException(status_code=409, detail="El proyecto no está en desarrollo")
    if editar and not puede_editar:
        raise HTTPException(status_code=403, detail="Solo el PM, el especialista técnico o el Incident Manager registran avances")
    return incident, detalle, roles, puede_editar


@router.get("/{incident_id}/desarrollo")
async def get_desarrollo(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import ControlCambiosEtapa
    incident, detalle, roles, puede_editar = await _cargar_cdc_desarrollo(db, incident_id, user)
    avances = await _avances_de(db, incident_id)
    rts = _rts_con_estado(await _rts_diseno(db, incident_id), avances)
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == "entrega_pruebas"]
    res = await db.execute(select(ControlCambiosEtapa).where(ControlCambiosEtapa.incident_id == incident_id,
                                                            ControlCambiosEtapa.etapa == "en_diseno_tecnico").order_by(ControlCambiosEtapa.created_at))
    etapas_tec = res.scalars().all()
    hoy = _hora_local(datetime.now(timezone.utc)).date()
    total_est = sum(r["horas_estimadas"] or 0 for r in rts)
    total_real = sum(r["horas_reales"] or 0 for r in rts)
    return {
        "status": incident.status, "puede_editar": puede_editar,
        "puede_cerrar": _puede_cerrar_desarrollo(roles, user.get("user_id"), detalle, incident),
        "puede_reasignar": _puede_cerrar_desarrollo(roles, user.get("user_id"), detalle, incident),
        "responsable": {"id": incident.assigned_to_user_id, "name": await _nombre_usuario(incident.assigned_to_user_id)} if incident.assigned_to_user_id else None,
        "rts": rts,
        "resumen": {
            "total": len(rts), "terminados": sum(1 for r in rts if r["estado"] == "terminado"),
            "horas_estimadas": total_est, "horas_reales": total_real,
            "inicio": etapas_tec[-1].created_at.isoformat() if etapas_tec else None,
            "fecha_compromiso": detalle.fecha_compromiso.isoformat() if detalle and detalle.fecha_compromiso else None,
            "dias_restantes": (detalle.fecha_compromiso - hoy).days if detalle and detalle.fecha_compromiso else None,
        },
        "avances": [
            {"id": a.id, "rt_id": a.rt_id, "estado": a.estado, "horas": a.horas, "comentario": a.comentario,
             "anexos": a.anexos or [], "autor_nombre": a.autor_nombre, "created_at": a.created_at.isoformat()}
            for a in reversed(avances)
        ],
        "entrega": [_doc_json(d) for d in docs],
        "solicitante": {"id": incident.requester_id, "name": incident.requester_name},
        "project_manager": {"id": detalle.project_manager_id, "name": detalle.project_manager_nombre} if detalle and detalle.project_manager_id else None,
    }


class CambioRt(BaseModel):
    id: str
    estado: str
    horas: Optional[float] = None


class AvancePayload(BaseModel):
    comentario: Optional[str] = None
    rts: list[CambioRt] = []


@router.post("/{incident_id}/desarrollo/avance")
async def registrar_avance(incident_id: str, payload: str = Form(...), files: list[UploadFile] = File(default=[]),
                           db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user),
                           raw_token: str = Depends(get_token_from_request)):
    import json
    from pydantic import ValidationError
    from app.models.mesa_de_soporte import ControlCambiosAvance, IncidentActivityLog
    incident, detalle, roles, _ = await _cargar_cdc_desarrollo(db, incident_id, user, editar=True)
    try:
        body = AvancePayload(**json.loads(payload))
    except (ValueError, ValidationError):
        raise HTTPException(status_code=422, detail="Los datos del avance no son válidos")
    comentario = (body.comentario or "").strip()
    if not comentario and not body.rts and not files:
        raise HTTPException(status_code=422, detail="Escribe un comentario o actualiza algún requerimiento")
    validos = {r["id"] for r in await _rts_diseno(db, incident_id)}
    for c in body.rts:
        if c.id.upper() not in validos:
            raise HTTPException(status_code=422, detail=f"{c.id} no existe en el diseño técnico")
        if c.estado not in ESTADOS_RT:
            raise HTTPException(status_code=422, detail=f"Estado no válido para {c.id}")
        if c.horas is not None and c.horas < 0:
            raise HTTPException(status_code=422, detail=f"Las horas de {c.id} no pueden ser negativas")

    solicitante = await _get_requester_profile(incident.requester_id)
    anexos = []
    for f in files:
        content = await f.read()
        if len(content) > MAX_DOC_BYTES:
            raise HTTPException(status_code=413, detail=f"{f.filename} excede 20 MB")
        mime = _mime_por_extension(f.filename, f.content_type)
        key = await _subir_archivo(content, f.filename, mime, solicitante.get("company_slug"), f"control-de-cambios/{incident.folio}", raw_token)
        if not key:
            raise HTTPException(status_code=502, detail=f"No se pudo subir {f.filename}")
        anexos.append({"nombre": f.filename, "object_key": key, "bucket": "dirdoc", "mime_type": mime})

    autor = user.get("full_name") or ""
    now = datetime.now(timezone.utc)
    if comentario or anexos:
        db.add(ControlCambiosAvance(id=str(uuid.uuid4()), incident_id=incident.id, comentario=comentario or None, anexos=anexos,
                                    autor_id=user.get("user_id"), autor_nombre=autor, created_at=now))
    for c in body.rts:
        db.add(ControlCambiosAvance(id=str(uuid.uuid4()), incident_id=incident.id, rt_id=c.id.upper(), estado=c.estado,
                                    horas=c.horas, anexos=[], autor_id=user.get("user_id"), autor_nombre=autor, created_at=now))
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_avance_registrado", performed_by=user.get("user_id"),
        performed_by_name=autor, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"rts": [{"id": c.id.upper(), "estado": c.estado} for c in body.rts], "comentario": comentario[:140], "anexos": len(anexos)},
    ))
    await db.commit()
    return {"success": True}


@router.put("/{incident_id}/desarrollo/entrega/borrador")
async def borrador_entrega(incident_id: str, body: BorradorPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import ControlCambiosDocumento
    incident, detalle, roles, _ = await _cargar_cdc_desarrollo(db, incident_id, user, editar=True)
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == "entrega_pruebas"]
    ultimo = docs[-1] if docs else None
    if ultimo and ultimo.estado == "borrador":
        ultimo.datos = body.datos
        doc = ultimo
    else:
        doc = ControlCambiosDocumento(id=str(uuid.uuid4()), incident_id=incident.id, tipo="entrega_pruebas",
                                      version=(ultimo.version + 1) if ultimo else 1, estado="borrador", origen="formulario",
                                      datos=body.datos, creado_por=user.get("user_id"), creado_por_nombre=user.get("full_name") or "")
        db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_json(doc)


@router.post("/{incident_id}/desarrollo/entrega/generar")
async def generar_entrega(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user),
                          raw_token: str = Depends(get_token_from_request)):
    from app.models.mesa_de_soporte import IncidentActivityLog
    from app.services.control_cambios.pdf_proyecto import generar_pdf_entrega
    incident, detalle, roles, _ = await _cargar_cdc_desarrollo(db, incident_id, user, editar=True)
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == "entrega_pruebas"]
    doc = docs[-1] if docs else None
    if not doc or doc.estado != "borrador":
        raise HTTPException(status_code=409, detail="No hay un borrador para generar")
    datos = doc.datos or {}
    for campo, msg in (("entregado", "qué se entrega"), ("ambiente", "el ambiente de pruebas"), ("instrucciones", "las instrucciones para validar")):
        if not (datos.get(campo) or "").strip():
            raise HTTPException(status_code=422, detail=f"Falta {msg}")
    rts = _rts_con_estado(await _rts_diseno(db, incident_id), await _avances_de(db, incident_id))
    autor = user.get("full_name") or ""
    base = await _base_diseno(db, incident, detalle, doc.version, autor)
    pdf_bytes = generar_pdf_entrega({
        **base, "pm": detalle.project_manager_nombre or autor,
        "entregado": datos["entregado"].strip(), "ambiente": datos["ambiente"].strip(), "instrucciones": datos["instrucciones"].strip(),
        "datos_prueba": (datos.get("datos_prueba") or "").strip(), "limitaciones": (datos.get("limitaciones") or "").strip(),
        "criterios": await _criterios_funcionales(db, incident_id), "rts": rts,
        "total_estimado": sum(r["horas_estimadas"] or 0 for r in rts), "total_real": sum(r["horas_reales"] or 0 for r in rts),
    })
    solicitante = await _get_requester_profile(incident.requester_id)
    nombre = f"ENTREGA_A_PRUEBAS_{incident.folio}_v{doc.version}.pdf"
    key = await _subir_archivo(pdf_bytes, nombre, "application/pdf", solicitante.get("company_slug"), f"control-de-cambios/{incident.folio}", raw_token)
    if not key:
        raise HTTPException(status_code=502, detail="No se pudo guardar el PDF")
    doc.estado, doc.object_key, doc.nombre, doc.mime_type = "generado", key, nombre, "application/pdf"
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_documento_generado", performed_by=user.get("user_id"),
        performed_by_name=autor, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"tipo": "entrega_pruebas", "version": doc.version, "documento_id": doc.id},
    ))
    await db.commit()
    await db.refresh(doc)
    return _doc_json(doc)


@router.post("/{incident_id}/desarrollo/liberar")
async def liberar_a_pruebas(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import ControlCambiosEtapa, IncidentActivityLog
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    incident, detalle, roles, _ = await _cargar_cdc_desarrollo(db, incident_id, user, editar=True)
    if not _puede_cerrar_desarrollo(roles, user.get("user_id"), detalle, incident):
        raise HTTPException(status_code=403, detail="Solo el Project Manager o el Incident Manager liberan a pruebas")
    rts = _rts_con_estado(await _rts_diseno(db, incident_id), await _avances_de(db, incident_id))
    pendientes = [r["id"] for r in rts if r["estado"] != "terminado"]
    if pendientes:
        raise HTTPException(status_code=409, detail=f"Faltan requerimientos por terminar: {', '.join(pendientes)}")
    docs = [d for d in await _docs_de(db, incident_id) if d.tipo == "entrega_pruebas"]
    nota = docs[-1] if docs else None
    if not nota or nota.estado != "generado":
        raise HTTPException(status_code=409, detail="Genera la nota de entrega a pruebas antes de liberar")

    autor = user.get("full_name") or ""
    db.add(ControlCambiosEtapa(
        id=str(uuid.uuid4()), incident_id=incident.id, etapa="en_desarrollo", resultado="liberado",
        datos={"nota": {"id": nota.id, "version": nota.version, "nombre": nota.nombre},
               "rts": {"total": len(rts), "horas_estimadas": sum(r["horas_estimadas"] or 0 for r in rts),
                       "horas_reales": sum(r["horas_reales"] or 0 for r in rts)}},
        documento_object_key=nota.object_key, anexos=[],
        realizado_por=user.get("user_id"), realizado_por_nombre=autor, created_at=datetime.now(timezone.utc),
    ))
    incident.status = "en_pruebas"
    incident.assigned_to_user_id = incident.requester_id   # la UAT la hace siempre el solicitante
    incident.assigned_team = None
    incident.assigned_at = datetime.now(timezone.utc)
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_liberado_pruebas", performed_by=user.get("user_id"),
        performed_by_name=autor, performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"nota_version": nota.version, "rts": len(rts)},
    ))
    await db.commit()
    await _broadcast_ticket_update(incident)

    try:
        from app.assignment import _notify_inapp
        from app.services.control_cambios.notificaciones import send_cdc_pruebas_email
        await _notify_inapp(incident.requester_id, f"Tu Control de Cambios #{incident.folio} está listo para pruebas",
                            incident.title, "info", {"incident_id": str(incident.id), "folio": incident.folio})
        solicitante = await _get_requester_profile(incident.requester_id)
        if solicitante.get("email"):
            datos = nota.datos or {}
            await send_cdc_pruebas_email(solicitante["email"], incident.requester_name, incident.folio, incident.title,
                                         detalle.project_manager_nombre or autor, datos.get("ambiente", ""), datos.get("instrucciones", ""),
                                         len(await _criterios_funcionales(db, incident_id)))
    except Exception as e:
        print(f"[CDC] Error notificando liberacion a pruebas {incident.folio}: {e}")
    return {"success": True, "status": incident.status}



# ── Asignacion del desarrollo ──

ROLES_DESARROLLO = (("especialista-tecnico", "Especialista técnico"), ("especialista-funcional", "Especialista funcional"),
                    ("incident-manager", "Incident Manager"))


def _puede_cerrar_desarrollo(roles: set, uid: Optional[str], detalle, incident) -> bool:
    """Liberar a pruebas y reasignar el desarrollo: solo PM o Incident Manager.
    Quien tiene asignado el desarrollo registra avances, pero no cierra la fase."""
    return incident.status == "en_desarrollo" and bool(
        roles & IM_ROLES or "it-service-desk:project-manager" in roles or (detalle and uid == detalle.project_manager_id)
    )


async def _activos_por_rol() -> dict:
    """{user_id: (team_slug, etiqueta, nombre)} de los roles que pueden desarrollar."""
    out = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        for slug, etiqueta in ROLES_DESARROLLO:
            resp = await client.get("http://admin-service:8000/internal/users/by-module-role",
                                    params={"module_slug": "it-service-desk", "role_slug": slug})
            for u in (resp.json() if resp.status_code == 200 else []):
                out.setdefault(u["id"], (slug, etiqueta, u["name"]))
    return out


@router.get("/{incident_id}/desarrollo/candidatos")
async def candidatos_desarrollo(incident_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    incident, detalle, roles, _ = await _cargar_cdc_desarrollo(db, incident_id, user)
    if not _puede_cerrar_desarrollo(roles, user.get("user_id"), detalle, incident):
        raise HTTPException(status_code=403, detail="Solo el Project Manager o el Incident Manager reasignan el desarrollo")
    return [{"id": uid, "name": nombre, "rol": etiqueta} for uid, (_, etiqueta, nombre) in (await _activos_por_rol()).items()]


@router.patch("/{incident_id}/desarrollo/asignar")
async def reasignar_desarrollo(incident_id: str, body: AsignarDisenoPayload, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    from app.models.mesa_de_soporte import IncidentActivityLog
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    incident, detalle, roles, _ = await _cargar_cdc_desarrollo(db, incident_id, user)
    if not _puede_cerrar_desarrollo(roles, user.get("user_id"), detalle, incident):
        raise HTTPException(status_code=403, detail="Solo el Project Manager o el Incident Manager reasignan el desarrollo")
    activos = await _activos_por_rol()
    if body.user_id not in activos:
        raise HTTPException(status_code=422, detail="Solo se puede asignar a un especialista o Incident Manager activo")
    slug, etiqueta, nombre = activos[body.user_id]
    anterior = incident.assigned_to_user_id
    incident.assigned_to_user_id = body.user_id
    incident.assigned_team = slug if slug != "incident-manager" else None
    incident.assigned_at = datetime.now(timezone.utc)
    db.add(IncidentActivityLog(
        incident_id=incident.id, action="cdc_desarrollo_reasignado", performed_by=user.get("user_id"),
        performed_by_name=user.get("full_name") or "", performed_by_role=_rol_de(roles), module_slug="it-service-desk",
        detail={"anterior": anterior, "nuevo": body.user_id, "nuevo_nombre": nombre},
    ))
    await db.commit()
    await _broadcast_ticket_update(incident)
    try:
        from app.assignment import _notify_inapp
        await _notify_inapp(body.user_id, f"Control de Cambios #{incident.folio}: desarrollo asignado", incident.title, "info",
                            {"incident_id": str(incident.id), "folio": incident.folio})
        perfil = await _get_requester_profile(body.user_id)
        if perfil.get("email"):
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post("http://email-service:8000/api/v1/email/system-notification", json={
                    "to_email": perfil["email"], "full_name": perfil.get("full_name", ""),
                    "subject": f"Control de Cambios {incident.folio}: se te asignó el desarrollo",
                    "message": "Se te asignó el desarrollo de este Control de Cambios. Registra tus avances y marca los requerimientos técnicos desde la intranet.",
                    "fields": [{"label": "Folio", "value": incident.folio, "mono": True}, {"label": "Titulo", "value": incident.title, "mono": False}],
                    "alert_type": "info",
                })
    except Exception as e:
        print(f"[CDC] Error notificando desarrollo {incident.folio}: {e}")
    return {"success": True, "asignado": {"id": body.user_id, "name": nombre, "rol": etiqueta}}
