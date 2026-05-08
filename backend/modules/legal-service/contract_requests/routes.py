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
    ContractRequestCreate, ContractRequestUpdate, ContractRequestSubmit,
    ContractRequestOut, ContractRequestListItem, ContractRequestDetail,
    ContractRequestReject, ContractRequestRequestCorrections,
    ContractCommentCreate, ContractCommentOut,
    ContractAttachmentOut, ContractAttachmentLogOut,
    ContractActivityLogOut, ContractStatusLogOut,
    ContractTimeTrackingOut, ContractFormSnapshotOut,
    PaginatedContractRequests, SLAReport, SLAReportItem,
    ContractStatus, SLAColor
)
from .service import (
    build_sla_info, get_sla_color, count_business_days_between,
    SLA_CLOSING_STATUSES
)
from .models import ContractRequest

router = APIRouter(prefix="/contract-requests", tags=["Contract Requests"])

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
    """Asigna un usuario con rol abogado a un tipo de contrato para el enrutamiento de solicitudes."""
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
    """Desactiva una asignación — el abogado deja de recibir nuevas solicitudes de ese tipo."""
    assignment = await service.deactivate_lawyer_assignment(db, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    await db.commit()


# ── Solicitudes de contrato — CRUD ────────────────────────────────────────────

@router.get("", response_model=PaginatedContractRequests)
async def list_contract_requests(
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
    Lista solicitudes de contrato con filtros.
    - Clientes solo ven solicitudes de su empresa.
    - Abogados solo ven solicitudes asignadas a ellos.
    - Coordinadores y super admins ven todo.
    """
    user_roles = user.get("roles", [])
    is_privileged = any(r in user_roles for r in ["super_admin", "coordinador_legal", "director"])

    # Aplicar reglas de visibilidad por rol
    if not is_privileged:
        if "abogado" in user_roles:
            lawyer_id = user["user_id"]
        else:
            companies = user.get("companies", [])
            if companies and not company_id:
                company_id = companies[0]

    items, total = await service.list_contract_requests(
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
        list_items.append(ContractRequestListItem(
            id=item.id,
            folio=item.folio,
            company_name=item.company_name,
            requested_by_name=item.requested_by_name,
            contract_type_name=item.contract_type_name,
            assigned_lawyer_name=item.assigned_lawyer_name,
            status=ContractStatus(item.status),
            is_open_request=item.is_open_request,
            submitted_at=item.submitted_at,
            sla_due_at=item.sla_due_at,
            is_sla_breached=item.is_sla_breached,
            sla_color=get_sla_color(item),
            created_at=item.created_at
        ))

    return PaginatedContractRequests(
        data=list_items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 1
    )


@router.post("", response_model=ContractRequestOut, status_code=201)
async def create_contract_request(
    request: Request,
    data: ContractRequestCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Crea una nueva solicitud de contrato en estado borrador. Cualquier usuario autenticado puede crear."""
    companies = user.get("companies", [])
    company_id = companies[0] if companies else ""
    try:
        req = await service.create_contract_request(
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
        sla = build_sla_info(req)
        out = ContractRequestOut.model_validate(req)
        out.sla = sla
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{request_id}", response_model=ContractRequestDetail)
async def get_contract_request(
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Devuelve el detalle completo de una solicitud incluyendo toda la trazabilidad.
    Los comentarios internos solo son visibles para el equipo legal.
    """
    req = await service.get_contract_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    user_roles = user.get("roles", [])
    is_legal = any(r in user_roles for r in ["super_admin", "coordinador_legal", "abogado", "director"])

    # Los clientes solo pueden ver solicitudes de su empresa
    if not is_legal:
        companies = user.get("companies", [])
        if req.company_id not in companies:
            raise HTTPException(status_code=403, detail="Acceso denegado")

    await service.log_activity(
        db, request_id, "viewed",
        user["user_id"], user["full_name"], user_roles[0] if user_roles else "cliente",
        ip_address=get_client_ip(request)
    )
    await db.commit()

    status_log = await service.get_request_status_log(db, request_id)
    time_tracking = await service.get_request_time_tracking(db, request_id)
    comments = await service.get_request_comments(db, request_id, include_internal=is_legal)
    attachments = await service.get_request_attachments(db, request_id)
    snapshots = await service.get_request_form_snapshots(db, request_id)
    activity = await service.get_request_activity_log(db, request_id) if is_legal else []

    req_out = ContractRequestOut.model_validate(req)
    req_out.sla = build_sla_info(req)

    return ContractRequestDetail(
        request=req_out,
        status_log=[ContractStatusLogOut.model_validate(s) for s in status_log],
        time_tracking=[ContractTimeTrackingOut.model_validate(t) for t in time_tracking] if is_legal else [],
        comments=[ContractCommentOut.model_validate(c) for c in comments],
        attachments=[ContractAttachmentOut.model_validate(a) for a in attachments],
        form_snapshots=[ContractFormSnapshotOut.model_validate(s) for s in snapshots] if is_legal else [],
        activity_log=[ContractActivityLogOut.model_validate(a) for a in activity]
    )


@router.patch("/{request_id}", response_model=ContractRequestOut)
async def update_contract_request(
    request_id: str,
    request: Request,
    data: ContractRequestUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Actualiza los datos del formulario mientras la solicitud esté en borrador o pendiente_cliente.
    Solo el solicitante puede editar su propia solicitud.
    """
    req = await service.get_contract_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if req.status not in ["borrador", "pendiente_cliente"]:
        raise HTTPException(status_code=400, detail="La solicitud no puede editarse en su estado actual")

    if req.requested_by_user_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="Solo el solicitante puede editar esta solicitud")

    old_form = req.form_data
    if data.form_data:
        req.form_data = data.form_data
    if data.counterparty_name is not None:
        req.counterparty_name = data.counterparty_name
    if data.counterparty_email is not None:
        req.counterparty_email = str(data.counterparty_email)
    if data.open_request_description is not None:
        req.open_request_description = data.open_request_description
    req.updated_at = datetime.utcnow()

    user_roles = user.get("roles", [])
    await service.log_activity(
        db, request_id, "form_edited",
        user["user_id"], user["full_name"], user_roles[0] if user_roles else "cliente",
        ip_address=get_client_ip(request),
        detail={"old": old_form, "new": req.form_data}
    )
    await db.commit()

    out = ContractRequestOut.model_validate(req)
    out.sla = build_sla_info(req)
    return out


# ── Transiciones de la máquina de estados ────────────────────────────────────

@router.post("/{request_id}/submit", response_model=ContractRequestOut)
async def submit_contract_request(
    request_id: str,
    request: Request,
    data: ContractRequestSubmit,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    El cliente envía la solicitud al área legal.
    Primer envío: borrador → pendiente_legal (asigna abogado e inicia SLA).
    Reenvío tras correcciones: pendiente_cliente → en_revision_legal.
    """
    user_roles = user.get("roles", [])
    try:
        req = await service.submit_contract_request(
            db, request_id, data,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "cliente",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = ContractRequestOut.model_validate(req)
        out.sla = build_sla_info(req)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{request_id}/approve", response_model=ContractRequestOut)
async def approve_contract_request(
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """El abogado aprueba la solicitud — transiciona a en_firmas y cierra el SLA."""
    user_roles = user.get("roles", [])
    try:
        req = await service.approve_contract_request(
            db, request_id,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = ContractRequestOut.model_validate(req)
        out.sla = build_sla_info(req)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{request_id}/request-corrections", response_model=ContractRequestOut)
async def request_corrections(
    request_id: str,
    request: Request,
    data: ContractRequestRequestCorrections,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """El abogado solicita correcciones — transiciona a pendiente_cliente. El SLA sigue corriendo."""
    user_roles = user.get("roles", [])
    try:
        req = await service.request_corrections(
            db, request_id, data.reason,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = ContractRequestOut.model_validate(req)
        out.sla = build_sla_info(req)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{request_id}/reject", response_model=ContractRequestOut)
async def reject_contract_request(
    request_id: str,
    request: Request,
    data: ContractRequestReject,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """El abogado rechaza la solicitud — transiciona a rechazado. La solicitud queda inmutable."""
    user_roles = user.get("roles", [])
    try:
        req = await service.reject_contract_request(
            db, request_id, data.reason,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = ContractRequestOut.model_validate(req)
        out.sla = build_sla_info(req)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{request_id}/complete", response_model=ContractRequestOut)
async def complete_contract_request(
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """Marca la solicitud como completada cuando todos los firmantes han firmado."""
    user_roles = user.get("roles", [])
    try:
        req = await service.complete_contract_request(
            db, request_id,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "abogado",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = ContractRequestOut.model_validate(req)
        out.sla = build_sla_info(req)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{request_id}/reassign", response_model=ContractRequestOut)
async def reassign_lawyer(
    request_id: str,
    request: Request,
    new_lawyer_id: str = Form(...),
    new_lawyer_name: str = Form(...),
    new_lawyer_email: str = Form(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """El coordinador reasigna la solicitud a otro abogado. El contador del SLA no se reinicia."""
    user_roles = user.get("roles", [])
    try:
        req = await service.reassign_lawyer(
            db, request_id,
            new_lawyer_id=new_lawyer_id,
            new_lawyer_name=new_lawyer_name,
            new_lawyer_email=new_lawyer_email,
            user_id=user["user_id"],
            user_name=user["full_name"],
            user_role=user_roles[0] if user_roles else "coordinador_legal",
            ip_address=get_client_ip(request)
        )
        await db.commit()
        out = ContractRequestOut.model_validate(req)
        out.sla = build_sla_info(req)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Comentarios ───────────────────────────────────────────────────────────────

@router.get("/{request_id}/comments", response_model=List[ContractCommentOut])
async def list_comments(
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Lista los comentarios. Los comentarios internos solo son visibles para el equipo legal."""
    user_roles = user.get("roles", [])
    is_legal = any(r in user_roles for r in ["super_admin", "coordinador_legal", "abogado", "director"])
    comments = await service.get_request_comments(db, request_id, include_internal=is_legal)
    return [ContractCommentOut.model_validate(c) for c in comments]


@router.post("/{request_id}/comments", response_model=ContractCommentOut, status_code=201)
async def add_comment(
    request_id: str,
    request: Request,
    data: ContractCommentCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Agrega un comentario a la solicitud.
    Los comentarios internos (is_internal=True) solo pueden agregarlos miembros del equipo legal.
    """
    user_roles = user.get("roles", [])
    is_legal = any(r in user_roles for r in ["super_admin", "coordinador_legal", "abogado"])

    if data.is_internal and not is_legal:
        raise HTTPException(status_code=403, detail="Solo el equipo legal puede agregar comentarios internos")

    comment = await service.add_comment(
        db, request_id, data,
        user_id=user["user_id"],
        user_name=user["full_name"],
        user_role=user_roles[0] if user_roles else "cliente",
        ip_address=get_client_ip(request)
    )
    await db.commit()
    return ContractCommentOut.model_validate(comment)


# ── Endpoints de trazabilidad ─────────────────────────────────────────────────

@router.get("/{request_id}/status-log", response_model=List[ContractStatusLogOut])
async def get_status_log(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado", "director"))
):
    """Devuelve el historial completo de cambios de estado. Solo equipo legal."""
    logs = await service.get_request_status_log(db, request_id)
    return [ContractStatusLogOut.model_validate(l) for l in logs]


@router.get("/{request_id}/time-tracking", response_model=List[ContractTimeTrackingOut])
async def get_time_tracking(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Devuelve el tiempo transcurrido en cada estado. Solo coordinador y super admin."""
    tracking = await service.get_request_time_tracking(db, request_id)
    return [ContractTimeTrackingOut.model_validate(t) for t in tracking]


@router.get("/{request_id}/activity-log", response_model=List[ContractActivityLogOut])
async def get_activity_log(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal"))
):
    """Devuelve el log completo de actividad. Solo coordinador y super admin."""
    logs = await service.get_request_activity_log(db, request_id)
    return [ContractActivityLogOut.model_validate(l) for l in logs]


@router.get("/{request_id}/form-snapshots", response_model=List[ContractFormSnapshotOut])
async def get_form_snapshots(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "abogado"))
):
    """Devuelve todos los snapshots del formulario — uno por cada envío. Solo equipo legal."""
    snapshots = await service.get_request_form_snapshots(db, request_id)
    return [ContractFormSnapshotOut.model_validate(s) for s in snapshots]


# ── Reporte de SLA ────────────────────────────────────────────────────────────

@router.get("/reports/sla", response_model=SLAReport)
async def get_sla_report(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_roles("super_admin", "coordinador_legal", "director"))
):
    """
    Devuelve el reporte de SLA actual con conteos de solicitudes atrasadas y a tiempo.
    Lo utiliza el cron diario y el panel de KPIs del dashboard.
    """
    from sqlalchemy import select, and_
    from .models import ContractRequest
    from datetime import datetime

    now = datetime.utcnow()

    result = await db.execute(
        select(ContractRequest).where(
            and_(
                ContractRequest.submitted_at != None,
                ContractRequest.sla_closed_at == None,
                ContractRequest.is_deleted == False
            )
        )
    )
    open_requests = result.scalars().all()

    overdue = []
    on_time = []
    in_signatures = []

    for req in open_requests:
        if req.status in ["en_firmas", "firmado_parcial"]:
            in_signatures.append(req)
            continue
        if req.is_sla_breached or (req.sla_due_at and req.sla_due_at < now):
            days_overdue = count_business_days_between(req.sla_due_at, now) if req.sla_due_at else 0
            side = "legal" if req.status in ["pendiente_legal", "en_revision_legal"] else "cliente"
            overdue.append(SLAReportItem(
                folio=req.folio,
                company_name=req.company_name,
                requested_by_name=req.requested_by_name,
                contract_type_name=req.contract_type_name,
                assigned_lawyer_name=req.assigned_lawyer_name,
                status=ContractStatus(req.status),
                submitted_at=req.submitted_at,
                sla_due_at=req.sla_due_at,
                days_overdue=days_overdue,
                side=side
            ))
        else:
            on_time.append(req)

    overdue.sort(key=lambda x: x.days_overdue, reverse=True)

    in_sig_items = []
    for req in in_signatures:
        in_sig_items.append(ContractRequestListItem(
            id=req.id,
            folio=req.folio,
            company_name=req.company_name,
            requested_by_name=req.requested_by_name,
            contract_type_name=req.contract_type_name,
            assigned_lawyer_name=req.assigned_lawyer_name,
            status=ContractStatus(req.status),
            is_open_request=req.is_open_request,
            submitted_at=req.submitted_at,
            sla_due_at=req.sla_due_at,
            is_sla_breached=req.is_sla_breached,
            sla_color=SLAColor.green,
            created_at=req.created_at
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
    Endpoint interno llamado por el cron diario para marcar solicitudes vencidas.
    Sin autenticación — solo accesible desde dentro de la red Docker.
    """
    updated = await service.update_sla_breach_flags(db)
    await db.commit()
    return {"updated": updated}