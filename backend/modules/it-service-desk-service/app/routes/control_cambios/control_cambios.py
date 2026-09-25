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
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
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
        system_id=None,
        module_id=None,
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

    sistema_result = await db.execute(select(TicketSystem).where(TicketSystem.id == body.system_id))
    sistema_obj = sistema_result.scalar_one_or_none()
    modulo_nombre = None
    if body.module_id:
        modulo_result = await db.execute(select(TicketModule).where(TicketModule.id == body.module_id))
        modulo_obj = modulo_result.scalar_one_or_none()
        modulo_nombre = modulo_obj.name if modulo_obj else None

    pdf_bytes = _generar_pdf_solicitud({
        "folio": folio,
        "fecha": now.strftime("%d/%m/%Y %H:%M"),
        "solicitante_nombre": profile.get("full_name", ""),
        "solicitante_correo": profile.get("email", ""),
        "solicitante_puesto": profile.get("puesto"),
        "solicitante_departamento": profile.get("departamento"),
        "empresa": profile.get("company_name", ""),
        "sistema_nombre": sistema_obj.name if sistema_obj else "—",
        "modulo_nombre": modulo_nombre,
        "area": body.area_departamento,
        "tipo_solicitud": body.tipo_solicitud,
        "titulo": body.titulo,
        "descripcion": body.descripcion_detallada,
        "justificacion": body.justificacion,
        "impacto": body.impacto_si_no_se_realiza,
        "urgencia": body.urgencia_solicitada,
        "fecha_requerida": body.fecha_requerida,
        "comentarios": body.comentarios_adicionales,
    })

    fecha_str = now.strftime("%Y%m%d_%H%M%S")
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
