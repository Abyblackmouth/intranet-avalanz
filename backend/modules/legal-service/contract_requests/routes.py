from fastapi import APIRouter, Depends, HTTPException, Query, Request, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any
from datetime import datetime
import math

from app.database import get_db
from app.config import config
from shared.middleware.jwt_validator import JWTValidator
from . import service
from .schemas import (
    ContractTypeCreate, ContractTypeUpdate, ContractTypeOut,
    LawyerAssignmentCreate, LawyerAssignmentOut,
    EnvelopeCreate, EnvelopeUpdate, EnvelopeSubmit,
    EnvelopeOut, EnvelopeListItem, EnvelopeDetail,
    EnvelopeReject, EnvelopeRequestCorrections,
    EnvelopeCommentCreate, EnvelopeCommentOut,
    EnvelopeAttachmentOut, EnvelopeAttachmentLogOut,
    EnvelopeActivityLogOut, EnvelopeStatusLogOut,
    EnvelopeTimeTrackingOut, EnvelopeFormSnapshotOut,
    PaginatedEnvelopes, SLAReport, SLAReportItem,
    EnvelopeStatus, SLAColor
)
from .service import (
    build_sla_info, get_sla_color, count_business_days_between,
    SLA_CLOSING_STATUSES
)
from .models import Envelope

router = APIRouter(prefix="/envelopes", tags=["Envelopes"])

# ── Validador JWT compartido ──────────────────────────────────────────────────
_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)

get_current_user = _validator.get_current_user()


def require_roles(*roles: str):
    """Dependencia que valida que el usuario tenga al menos uno de los roles indicados."""
    return _validator.require_roles(list(roles))


def get_client_ip(request: Request) -> Optional[str]:
    """Obtiene la IP real del cliente considerando proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


# ── Tipos de contrato ─────────────────────────────────────────────────────────

@router.get("/types", response_model=List[ContractTypeOut])
async def list_contract_types(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Devuelve todos los tipos de contrato. Por defecto solo los activos."""
    return await service.list_contract_types(db, active_only=active_only)


@router.get("/types/{contract_type_id}", response_model=ContractTypeOut)
async def get_contract_type(
    contract_type_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Devuelve un tipo de contrato con sus campos de formulario y definiciones de anexos."""
    ct = await service.get_contract_type(db, contract_type_id)
    if not ct:
        raise HTTPException(status_code=404, detail="Tipo de contrato no encontrado")
    return ct


@router.post("/types", response_model=ContractTypeOut, status_code=201)
async def create_contract_type(
    data: ContractTypeCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Crea un nuevo tipo de contrato. Solo coordinador legal o super admin."""
    ct = await service.create_contract_type(db, data, created_by=user["user_id"])
    await db.commit()
    return ct


@router.patch("/types/{contract_type_id}", response_model=ContractTypeOut)
async def update_contract_type(
    contract_type_id: str,
    data: ContractTypeUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Actualiza un tipo de contrato."""
    ct = await service.update_contract_type(db, contract_type_id, data)
    if not ct:
        raise HTTPException(status_code=404, detail="Tipo de contrato no encontrado")
    await db.commit()
    return ct


# ── Asignación de abogados ────────────────────────────────────────────────────

@router.post("/types/{contract_type_id}/lawyers", response_model=LawyerAssignmentOut, status_code=201)
async def assign_lawyer_to_type(
    contract_type_id: str,
    data: LawyerAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Asigna un usuario con rol abogado a un tipo de contrato para el enrutamiento de sobres."""
    data.contract_type_id = contract_type_id
    assignment = await service.assign_lawyer_to_type(db, data, assigned_by=user["user_id"])
    await db.commit()
    return assignment


@router.delete("/lawyers/assignments/{assignment_id}", status_code=204)
async def deactivate_lawyer_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Desactiva una asignación — el abogado deja de recibir nuevos sobres de ese tipo."""
    assignment = await service.deactivate_lawyer_assignment(db, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    await db.commit()


# ── Sobres — CRUD ─────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedEnvelopes)
async def list_envelopes(
    request: Request,
    company_id: Optional[str] = Query(None),
    lawyer_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    contract_type_id: Optional[str] = Query(None),
    is_sla_breached: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Lista sobres con filtros.
    - Clientes solo ven sobres de su empresa.
    - Abogados solo ven sobres asignados a ellos.
    - Coordinadores y super admins ven todo.
    """
    user_roles = user.get("roles", [])
    is_privileged = any(r in user_roles for r in ["super_admin", "coordinador_legal", "director"])

    if not is_privileged:
        if "abogado" in user_roles:
            lawyer_id = user["user_id"]
        else:
            companies = user.get("companies", [])
            if companies and not company_id:
                company_id = companies[0]

    items, total = await service.list_envelopes(
        db,
        company_id=company_id,
        lawyer_id=lawyer_id,
        status=status,
        contract_type_id=contract_type_id,
        is_sla_breached=is_sla_breached,
        page=page,
        per_page=per_page
    )

    list_items = []
    for item in items:
        list_items.append(EnvelopeListItem(
            id=item.id,
            folio=item.folio,
            company_name=item.company_name,
            requested_by_name=item.requested_by_name,
            contract_type_name=item.contract_type_name,
            assigned_lawyer_name=item.assigned_lawyer_name,
            status=EnvelopeStatus(item.status),
            is_open_request=item.is_open_request,
            submitted_at=item.submitted_at,
            sla_due_at=item.sla_due_at,
            is_sla_breached=item.is_sla_breached,
            sla_color=get_sla_color(item),
            created_at=item.created_at
        ))

    return PaginatedEnvelopes(
        data=list_items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 1
    )


@router.post("", response_model=EnvelopeOut, status_code=201)
async def create_envelope(
    request: Request,
    data: EnvelopeCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Crea un nuevo sobre en estado borrador. Cualquier usuario autenticado puede crear."""
    companies = user.get("companies", [])
    company_id = companies[0] if companies else ""
    try:
        envelope = await service.create_envelope(
            db,
            data,
            company_id=company_id,
            company_name=user.get("company_name", ""),
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_email=user["email"],
            ip_address=get_client_ip(request)
        )
        await db.commit()
        sla = build_sla_info(envelope)
        out = EnvelopeOut.model_validate(envelope)
        out.sla = sla
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



# ── Templates ─────────────────────────────────────────────────────────────────

import json as _json
from pathlib import Path as _Path

_TEMPLATES_DIR = _Path(__file__).parent.parent / "templates"

@router.get("/contract-templates", tags=["Templates"])
async def list_templates(user: dict = Depends(get_current_user)):
    """Lista todos los templates de contratos disponibles."""
    index_path = _TEMPLATES_DIR / "index.json"
    if not index_path.exists():
        return {"templates": []}
    with open(index_path, "r", encoding="utf-8") as f:
        return _json.load(f)

@router.get("/contract-templates/{template_slug}/fields", tags=["Templates"])
async def get_template_fields(template_slug: str, user: dict = Depends(get_current_user)):
    """Retorna la definición de campos de un template específico."""
    fields_path = _TEMPLATES_DIR / template_slug / "fields.json"
    if not fields_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Template '{template_slug}' no encontrado")
    with open(fields_path, "r", encoding="utf-8") as f:
        return _json.load(f)


@router.post("/contract-templates/{template_slug}/preview", tags=["Templates"])
async def preview_template(template_slug: str, form_data: dict, user: dict = Depends(get_current_user)):
    """Genera el HTML del contrato con los datos del formulario sustituidos."""
    from fastapi.responses import HTMLResponse
    html_path = _TEMPLATES_DIR / template_slug / "template.html"
    if not html_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Template HTML '{template_slug}' no encontrado")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    for key, value in form_data.items():
        html = html.replace(f"{{{{{key}}}}}", str(value) if value else "___________")
    # Campos auto-llenados
    html = html.replace("{{NUMERO_CONTRATO}}", "ENV-2026-XXXX")
    html = html.replace("{{FECHA_FIRMA}}", "[Fecha de firma DocuSign]")
    # Limpiar campos no sustituidos
    import re
    html = re.sub(r'\{\{[A-Z_]+\}\}', '___________', html)
    return HTMLResponse(content=html)


@router.post("/contract-templates/{template_slug}/preview-pdf", tags=["Templates"])
async def preview_template_pdf(template_slug: str, form_data: dict, user: dict = Depends(get_current_user)):
    """Genera un PDF del contrato con los datos del formulario."""
    from fastapi.responses import Response
    from weasyprint import HTML
    html_path = _TEMPLATES_DIR / template_slug / "template.html"
    if not html_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Template '{template_slug}' no encontrado")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    for key, value in form_data.items():
        html = html.replace(f"{{{{{key}}}}}", str(value) if value else "___________")
    html = html.replace("{{NUMERO_CONTRATO}}", "ENV-2026-XXXX")
    html = html.replace("{{FECHA_FIRMA}}", "[Fecha de firma DocuSign]")
    import re
    html = re.sub(r'\{\{[A-Z_]+\}\}', '___________', html)
    pdf_bytes = HTML(string=html, base_url="/").write_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=contrato-preview.pdf"}
    )


@router.post("/contract-templates/{template_slug}/preview-pdf", tags=["Templates"])
async def preview_template_pdf(template_slug: str, form_data: dict, user: dict = Depends(get_current_user)):
    """Genera un PDF del contrato con los datos del formulario."""
    from fastapi.responses import Response
    from weasyprint import HTML
    html_path = _TEMPLATES_DIR / template_slug / "template.html"
    if not html_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Template '{template_slug}' no encontrado")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    for key, value in form_data.items():
        html = html.replace(f"{{{{{key}}}}}", str(value) if value else "___________")
    html = html.replace("{{NUMERO_CONTRATO}}", "ENV-2026-XXXX")
    html = html.replace("{{FECHA_FIRMA}}", "[Fecha de firma DocuSign]")
    import re
    html = re.sub(r'\{\{[A-Z_]+\}\}', '___________', html)
    pdf_bytes = HTML(string=html, base_url="/").write_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=contrato-preview.pdf"}
    )

@router.get("/{envelope_id}", response_model=EnvelopeDetail)
async def get_envelope(
    envelope_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Devuelve el detalle completo de un sobre incluyendo toda la trazabilidad.
    Los comentarios internos solo son visibles para el equipo legal.
    """
    envelope = await service.get_envelope(db, envelope_id)
    if not envelope:
        raise HTTPException(status_code=404, detail="Sobre no encontrado")

    user_roles = user.get("roles", [])
    is_legal = any(r in user_roles for r in ["super_admin", "coordinador_legal", "abogado", "director"])

    if not is_legal:
        companies = user.get("companies", [])
        if envelope.company_id not in companies:
            raise HTTPException(status_code=403, detail="Acceso denegado")

    await service.log_activity(
        db, envelope_id, "viewed",
        user["user_id"], user["full_name"], user_roles[0] if user_roles else "cliente",
        ip_address=get_client_ip(request)
    )
    await db.commit()

    status_log = await service.get_envelope_status_log(db, envelope_id)
    time_tracking = await service.get_envelope_time_tracking(db, envelope_id)
    comments = await service.get_envelope_comments(db, envelope_id, include_internal=is_legal)
    attachments = await service.get_envelope_attachments(db, envelope_id)
    snapshots = await service.get_envelope_form_snapshots(db, envelope_id)
    activity = await service.get_envelope_activity_log(db, envelope_id) if is_legal else []

    envelope_out = EnvelopeOut.model_validate(envelope)
    envelope_out.sla = build_sla_info(envelope)

    return EnvelopeDetail(
        envelope=envelope_out,
        status_log=[EnvelopeStatusLogOut.model_validate(s) for s in status_log],
        time_tracking=[EnvelopeTimeTrackingOut.model_validate(t) for t in time_tracking] if is_legal else [],
        comments=[EnvelopeCommentOut.model_validate(c) for c in comments],
        attachments=[EnvelopeAttachmentOut.model_validate(a) for a in attachments],
        form_snapshots=[EnvelopeFormSnapshotOut.model_validate(s) for s in snapshots] if is_legal else [],
        activity_log=[EnvelopeActivityLogOut.model_validate(a) for a in activity]
    )


@router.patch("/{envelope_id}", response_model=EnvelopeOut)
async def update_envelope(
    envelope_id: str,
    request: Request,
    data: EnvelopeUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Actualiza los datos del formulario mientras el sobre esté en borrador o pendiente_cliente.
    Solo el solicitante puede editar su propio sobre.
    """
    envelope = await service.get_envelope(db, envelope_id)
    if not envelope:
        raise HTTPException(status_code=404, detail="Sobre no encontrado")

    if envelope.status not in ["borrador", "pendiente_cliente"]:
        raise HTTPException(status_code=400, detail="El sobre no puede editarse en su estado actual")

    if envelope.requested_by_user_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="Solo el solicitante puede editar este sobre")

    old_form = envelope.form_data
    if data.form_data:
        envelope.form_data = data.form_data
    if data.counterparty_name is not None:
        envelope.counterparty_name = data.counterparty_name
    if data.counterparty_email is not None:
        envelope.counterparty_email = str(data.counterparty_email)
    if data.open_request_description is not None:
        envelope.open_request_description = data.open_request_description
    envelope.updated_at = datetime.utcnow()

    user_roles = user.get("roles", [])
    await service.log_activity(
        db, envelope_id, "form_edited",
        user["user_id"], user["full_name"], user_roles[0] if user_roles else "cliente",
        ip_address=get_client_ip(request),
        detail={"old": old_form, "new": envelope.form_data}
    )
    await db.commit()

    out = EnvelopeOut.model_validate(envelope)
    out.sla = build_sla_info(envelope)
    return out


# ── Transiciones de la máquina de estados ────────────────────────────────────

@router.post("/{envelope_id}/submit", response_model=EnvelopeOut)
async def submit_envelope(
    envelope_id: str,
    request: Request,
    data: EnvelopeSubmit,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    El cliente envía el sobre al área legal.
    Primer envío: borrador → pendiente_legal (asigna abogado e inicia SLA).
    Reenvío tras correcciones: pendiente_cliente → en_revision_legal.
    """
    user_roles = user.get("roles", [])
    try:
        envelope = await service.submit_envelope(
            db, envelope_id, data,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "cliente",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = EnvelopeOut.model_validate(envelope)
        out.sla = build_sla_info(envelope)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{envelope_id}/approve", response_model=EnvelopeOut)
async def approve_envelope(
    envelope_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """El abogado aprueba el sobre — transiciona a en_firmas y cierra el SLA."""
    user_roles = user.get("roles", [])
    try:
        envelope = await service.approve_envelope(
            db, envelope_id,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = EnvelopeOut.model_validate(envelope)
        out.sla = build_sla_info(envelope)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{envelope_id}/request-corrections", response_model=EnvelopeOut)
async def request_corrections(
    envelope_id: str,
    request: Request,
    data: EnvelopeRequestCorrections,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """El abogado solicita correcciones — transiciona a pendiente_cliente. El SLA sigue corriendo."""
    user_roles = user.get("roles", [])
    try:
        envelope = await service.request_corrections(
            db, envelope_id, data.reason,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = EnvelopeOut.model_validate(envelope)
        out.sla = build_sla_info(envelope)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{envelope_id}/reject", response_model=EnvelopeOut)
async def reject_envelope(
    envelope_id: str,
    request: Request,
    data: EnvelopeReject,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """El abogado rechaza el sobre — transiciona a rechazado. El sobre queda inmutable."""
    user_roles = user.get("roles", [])
    try:
        envelope = await service.reject_envelope(
            db, envelope_id, data.reason,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = EnvelopeOut.model_validate(envelope)
        out.sla = build_sla_info(envelope)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{envelope_id}/complete", response_model=EnvelopeOut)
async def complete_envelope(
    envelope_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """Marca el sobre como completado cuando todos los firmantes han firmado."""
    user_roles = user.get("roles", [])
    try:
        envelope = await service.complete_envelope(
            db, envelope_id,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = EnvelopeOut.model_validate(envelope)
        out.sla = build_sla_info(envelope)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{envelope_id}/reassign", response_model=EnvelopeOut)
async def reassign_lawyer(
    envelope_id: str,
    request: Request,
    new_lawyer_id: str = Form(...),
    new_lawyer_name: str = Form(...),
    new_lawyer_email: str = Form(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """El coordinador reasigna el sobre a otro abogado. El contador del SLA no se reinicia."""
    user_roles = user.get("roles", [])
    try:
        envelope = await service.reassign_lawyer(
            db, envelope_id,
            new_lawyer_id=new_lawyer_id,
            new_lawyer_name=new_lawyer_name,
            new_lawyer_email=new_lawyer_email,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "coordinador_legal",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = EnvelopeOut.model_validate(envelope)
        out.sla = build_sla_info(envelope)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Comentarios ───────────────────────────────────────────────────────────────

@router.get("/{envelope_id}/comments", response_model=List[EnvelopeCommentOut])
async def list_comments(
    envelope_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Lista los comentarios. Los internos solo son visibles para el equipo legal."""
    user_roles = user.get("roles", [])
    is_legal = any(r in user_roles for r in ["super_admin", "coordinador_legal", "abogado", "director"])
    comments = await service.get_envelope_comments(db, envelope_id, include_internal=is_legal)
    return [EnvelopeCommentOut.model_validate(c) for c in comments]


@router.post("/{envelope_id}/comments", response_model=EnvelopeCommentOut, status_code=201)
async def add_comment(
    envelope_id: str,
    request: Request,
    data: EnvelopeCommentCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Agrega un comentario al sobre.
    Los comentarios internos (is_internal=True) solo pueden agregarlos miembros del equipo legal.
    """
    user_roles = user.get("roles", [])
    is_legal = any(r in user_roles for r in ["super_admin", "coordinador_legal", "abogado"])

    if data.is_internal and not is_legal:
        raise HTTPException(status_code=403, detail="Solo el equipo legal puede agregar comentarios internos")

    comment = await service.add_comment(
        db, envelope_id, data,
        user_id=user["user_id"],
        user_name=user["full_name"],
        user_role=user_roles[0] if user_roles else "cliente",
        ip_address=get_client_ip(request)
    )
    await db.commit()
    return EnvelopeCommentOut.model_validate(comment)


# ── Endpoints de trazabilidad ─────────────────────────────────────────────────

@router.get("/{envelope_id}/status-log", response_model=List[EnvelopeStatusLogOut])
async def get_status_log(
    envelope_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado", "director"))
):
    """Devuelve el historial completo de cambios de estado. Solo equipo legal."""
    logs = await service.get_envelope_status_log(db, envelope_id)
    return [EnvelopeStatusLogOut.model_validate(l) for l in logs]


@router.get("/{envelope_id}/time-tracking", response_model=List[EnvelopeTimeTrackingOut])
async def get_time_tracking(
    envelope_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Devuelve el tiempo transcurrido en cada estado. Solo coordinador y super admin."""
    tracking = await service.get_envelope_time_tracking(db, envelope_id)
    return [EnvelopeTimeTrackingOut.model_validate(t) for t in tracking]


@router.get("/{envelope_id}/activity-log", response_model=List[EnvelopeActivityLogOut])
async def get_activity_log(
    envelope_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Devuelve el log completo de actividad. Solo coordinador y super admin."""
    logs = await service.get_envelope_activity_log(db, envelope_id)
    return [EnvelopeActivityLogOut.model_validate(l) for l in logs]


@router.get("/{envelope_id}/form-snapshots", response_model=List[EnvelopeFormSnapshotOut])
async def get_form_snapshots(
    envelope_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """Devuelve todos los snapshots del formulario — uno por cada envío. Solo equipo legal."""
    snapshots = await service.get_envelope_form_snapshots(db, envelope_id)
    return [EnvelopeFormSnapshotOut.model_validate(s) for s in snapshots]


# ── Reporte de SLA ────────────────────────────────────────────────────────────

@router.get("/reports/sla", response_model=SLAReport)
async def get_sla_report(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "director"))
):
    """
    Devuelve el reporte de SLA actual con conteos de sobres atrasados y a tiempo.
    Lo utiliza el cron diario y el panel de KPIs del dashboard.
    """
    from sqlalchemy import select, and_
    from .models import Envelope
    from datetime import datetime

    now = datetime.utcnow()

    result = await db.execute(
        select(Envelope).where(
            and_(
                Envelope.submitted_at != None,
                Envelope.sla_closed_at == None,
                Envelope.is_deleted == False
            )
        )
    )
    open_envelopes = result.scalars().all()

    overdue = []
    on_time = []
    in_signatures = []

    for envelope in open_envelopes:
        if envelope.status in ["en_firmas", "firmado_parcial"]:
            in_signatures.append(envelope)
            continue
        if envelope.is_sla_breached or (envelope.sla_due_at and envelope.sla_due_at < now):
            days_overdue = count_business_days_between(envelope.sla_due_at, now) if envelope.sla_due_at else 0
            side = "legal" if envelope.status in ["pendiente_legal", "en_revision_legal"] else "cliente"
            overdue.append(SLAReportItem(
                folio=envelope.folio,
                company_name=envelope.company_name,
                requested_by_name=envelope.requested_by_name,
                contract_type_name=envelope.contract_type_name,
                assigned_lawyer_name=envelope.assigned_lawyer_name,
                status=EnvelopeStatus(envelope.status),
                submitted_at=envelope.submitted_at,
                sla_due_at=envelope.sla_due_at,
                days_overdue=days_overdue,
                side=side
            ))
        else:
            on_time.append(envelope)

    overdue.sort(key=lambda x: x.days_overdue, reverse=True)

    in_sig_items = []
    for envelope in in_signatures:
        in_sig_items.append(EnvelopeListItem(
            id=envelope.id,
            folio=envelope.folio,
            company_name=envelope.company_name,
            requested_by_name=envelope.requested_by_name,
            contract_type_name=envelope.contract_type_name,
            assigned_lawyer_name=envelope.assigned_lawyer_name,
            status=EnvelopeStatus(envelope.status),
            is_open_request=envelope.is_open_request,
            submitted_at=envelope.submitted_at,
            sla_due_at=envelope.sla_due_at,
            is_sla_breached=envelope.is_sla_breached,
            sla_color=SLAColor.green,
            created_at=envelope.created_at
        ))

    return SLAReport(
        generated_at=now,
        overdue_count=len(overdue),
        on_time_count=len(on_time),
        in_signatures_count=len(in_signatures),
        overdue_items=overdue,
        in_signatures_items=in_sig_items
    )


@router.post("/internal/update-sla-flags", status_code=200)
async def update_sla_flags(
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint interno llamado por el cron diario para marcar sobres vencidos.
    Sin autenticación — solo accesible desde dentro de la red Docker.
    """
    updated = await service.update_sla_breach_flags(db)
    await db.commit()
    return {"updated": updated}
