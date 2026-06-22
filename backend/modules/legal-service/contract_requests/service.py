import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, and_, or_
from sqlalchemy.orm import selectinload

from .models import (
    ContractType, ContractTypeField, ContractTypeAttachmentDef,
    LawyerAssignment, Envelope, EnvelopeFormSnapshot,
    EnvelopeStatusLog, EnvelopeTimeTracking, EnvelopeComment,
    EnvelopeAttachment, EnvelopeAttachmentLog, EnvelopeActivityLog,
    FolioSequence
)
from .schemas import (
    EnvelopeStatus, SLAColor, SLAInfo,
    EnvelopeCreate, EnvelopeUpdate, EnvelopeSubmit,
    ContractTypeCreate, ContractTypeUpdate,
    LawyerAssignmentCreate, EnvelopeCommentCreate
)

# ── Business day calendar ─────────────────────────────────────────────────────

MEXICAN_HOLIDAYS_2026 = {
    date(2026, 1, 1),
    date(2026, 2, 2),
    date(2026, 3, 16),
    date(2026, 4, 2),
    date(2026, 4, 3),
    date(2026, 5, 1),
    date(2026, 9, 16),
    date(2026, 11, 2),
    date(2026, 11, 16),
    date(2026, 12, 25),
}


def is_business_day(d: date) -> bool:
    """Returns True if the given date is a business day (Mon-Fri, non-holiday)."""
    return d.weekday() < 5 and d not in MEXICAN_HOLIDAYS_2026


def add_business_days(start: datetime, days: int) -> datetime:
    """Adds the given number of business days to a datetime."""
    current = start.date()
    added = 0
    while added < days:
        current += timedelta(days=1)
        if is_business_day(current):
            added += 1
    return datetime.combine(current, start.time(), tzinfo=start.tzinfo)


def count_business_days_between(start: datetime, end: datetime) -> int:
    """Counts business days between two datetimes."""
    current = start.date()
    target = end.date()
    count = 0
    while current < target:
        current += timedelta(days=1)
        if is_business_day(current):
            count += 1
    return count


def get_sla_color(envelope: Envelope) -> SLAColor:
    """Returns traffic light color based on SLA status."""
    if not envelope.submitted_at or not envelope.sla_due_at:
        return SLAColor.green
    if envelope.is_sla_breached:
        return SLAColor.red
    now = datetime.now(timezone.utc)
    days_remaining = count_business_days_between(now, envelope.sla_due_at)
    if days_remaining <= 1:
        return SLAColor.yellow
    return SLAColor.green


def build_sla_info(envelope: Envelope) -> SLAInfo:
    """Builds the SLA info block for an envelope."""
    if not envelope.submitted_at:
        return SLAInfo(
            submitted_at=None,
            sla_due_at=None,
            business_days_elapsed=None,
            business_days_remaining=None,
            is_breached=False,
            color=SLAColor.green
        )
    now = datetime.now(timezone.utc)
    elapsed = count_business_days_between(envelope.submitted_at, now)
    remaining = count_business_days_between(now, envelope.sla_due_at) if envelope.sla_due_at else None
    return SLAInfo(
        submitted_at=envelope.submitted_at,
        sla_due_at=envelope.sla_due_at,
        business_days_elapsed=elapsed,
        business_days_remaining=remaining,
        is_breached=envelope.is_sla_breached,
        color=get_sla_color(envelope)
    )


# ── SLA closing statuses ──────────────────────────────────────────────────────

SLA_CLOSING_STATUSES = {
    EnvelopeStatus.completado,
    EnvelopeStatus.rechazado,
    EnvelopeStatus.en_firmas,
}

# ── Valid status transitions ──────────────────────────────────────────────────

VALID_TRANSITIONS: Dict[str, List[str]] = {
    "borrador": ["pendiente_legal"],
    "pendiente_legal": ["pendiente_cliente", "en_firmas", "rechazado"],
    "pendiente_cliente": ["en_revision_legal"],
    "en_revision_legal": ["pendiente_cliente", "en_firmas", "rechazado"],
    "en_firmas": ["firmado_parcial", "completado"],
    "firmado_parcial": ["completado"],
    "completado": [],
    "rechazado": [],
}


def validate_transition(from_status: str, to_status: str) -> bool:
    """Validates if a status transition is allowed."""
    return to_status in VALID_TRANSITIONS.get(from_status, [])


# ── Folio generation ──────────────────────────────────────────────────────────

async def generate_folio(db: AsyncSession) -> str:
    """Generates the next folio in format ENV-YYYY-NNNN using a DB sequence."""
    year = datetime.now(timezone.utc).year
    result = await db.execute(
        select(FolioSequence).where(FolioSequence.year == year)
    )
    sequence = result.scalar_one_or_none()
    if not sequence:
        sequence = FolioSequence(year=year, last_sequence=0)
        db.add(sequence)
        await db.flush()
    sequence.last_sequence += 1
    await db.flush()
    return f"ENV-{year}-{sequence.last_sequence:04d}"


# ── Lawyer balancing ──────────────────────────────────────────────────────────

async def assign_lawyer(db: AsyncSession, contract_type_id: str) -> Optional[Dict[str, str]]:
    """
    Assigns the best available lawyer for the given contract type.
    Balancing logic:
    1. Get active lawyers assigned to this contract type.
    2. Count non-overdue pending envelopes per lawyer.
    3. Assign the one with fewest non-overdue pending envelopes.
    4. On tie, assign the one who received an envelope least recently.
    """
    result = await db.execute(
        select(LawyerAssignment).where(
            and_(
                LawyerAssignment.contract_type_id == contract_type_id,
                LawyerAssignment.is_active == True
            )
        )
    )
    lawyers = result.scalars().all()
    if not lawyers:
        return None

    now = datetime.now(timezone.utc)
    best_lawyer = None
    best_count = None
    best_last_assigned = None

    for lawyer in lawyers:
        count_result = await db.execute(
            select(func.count(Envelope.id)).where(
                and_(
                    Envelope.assigned_lawyer_id == lawyer.lawyer_user_id,
                    Envelope.status.in_([
                        "pendiente_legal", "en_revision_legal", "pendiente_cliente"
                    ]),
                    Envelope.is_deleted == False,
                    or_(
                        Envelope.sla_due_at == None,
                        Envelope.sla_due_at >= now
                    )
                )
            )
        )
        count = count_result.scalar() or 0

        last_result = await db.execute(
            select(func.max(Envelope.assigned_at)).where(
                Envelope.assigned_lawyer_id == lawyer.lawyer_user_id
            )
        )
        last_assigned = last_result.scalar()

        if best_count is None or count < best_count:
            best_count = count
            best_lawyer = lawyer
            best_last_assigned = last_assigned
        elif count == best_count:
            if last_assigned is None or (best_last_assigned and last_assigned < best_last_assigned):
                best_lawyer = lawyer
                best_last_assigned = last_assigned

    if not best_lawyer:
        return None

    return {
        "lawyer_user_id": best_lawyer.lawyer_user_id,
        "lawyer_name": best_lawyer.lawyer_name,
        "lawyer_email": best_lawyer.lawyer_email,
    }


# ── Activity logging helpers ──────────────────────────────────────────────────

async def log_activity(
    db: AsyncSession,
    envelope_id: str,
    action: str,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None
) -> None:
    """Inserts a record in the activity log."""
    log = EnvelopeActivityLog(
        envelope_id=envelope_id,
        action=action,
        performed_by_user_id=user_id,
        performed_by_name=user_name,
        performed_by_role=user_role,
        performed_at=datetime.now(timezone.utc),
        ip_address=ip_address,
        detail=detail
    )
    db.add(log)


async def log_status_change(
    db: AsyncSession,
    envelope_id: str,
    from_status: Optional[str],
    to_status: str,
    user_id: str,
    user_name: str,
    user_role: str,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None
) -> None:
    """Inserts an immutable status transition record."""
    log = EnvelopeStatusLog(
        envelope_id=envelope_id,
        from_status=from_status,
        to_status=to_status,
        changed_by_user_id=user_id,
        changed_by_name=user_name,
        changed_by_role=user_role,
        reason=reason,
        changed_at=datetime.now(timezone.utc),
        ip_address=ip_address
    )
    db.add(log)


async def close_time_tracking(
    db: AsyncSession,
    envelope_id: str,
    status: str
) -> None:
    """Closes the open time tracking record for the given status."""
    result = await db.execute(
        select(EnvelopeTimeTracking).where(
            and_(
                EnvelopeTimeTracking.envelope_id == envelope_id,
                EnvelopeTimeTracking.status == status,
                EnvelopeTimeTracking.ended_at == None
            )
        )
    )
    tracking = result.scalar_one_or_none()
    if tracking:
        now = datetime.now(timezone.utc)
        tracking.ended_at = now
        elapsed = now - tracking.started_at
        tracking.duration_minutes = int(elapsed.total_seconds() / 60)


async def open_time_tracking(
    db: AsyncSession,
    envelope_id: str,
    status: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None
) -> None:
    """Opens a new time tracking record for the given status."""
    tracking = EnvelopeTimeTracking(
        envelope_id=envelope_id,
        status=status,
        responsible_user_id=user_id,
        responsible_user_name=user_name,
        started_at=datetime.now(timezone.utc)
    )
    db.add(tracking)


# ── Contract Type service ─────────────────────────────────────────────────────

async def list_contract_types(db: AsyncSession, active_only: bool = True) -> List[ContractType]:
    q = select(ContractType)
    if active_only:
        q = q.where(ContractType.is_active == True)
    result = await db.execute(q.order_by(ContractType.name))
    return result.scalars().all()


async def get_contract_type(db: AsyncSession, contract_type_id: str) -> Optional[ContractType]:
    result = await db.execute(
        select(ContractType).where(ContractType.id == contract_type_id)
    )
    return result.scalar_one_or_none()


async def create_contract_type(
    db: AsyncSession,
    data: ContractTypeCreate,
    created_by: str
) -> ContractType:
    ct = ContractType(
        name=data.name,
        slug=data.slug,
        description=data.description,
        sla_business_days=data.sla_business_days,
        created_by=created_by
    )
    db.add(ct)
    await db.flush()
    return ct


async def update_contract_type(
    db: AsyncSession,
    contract_type_id: str,
    data: ContractTypeUpdate
) -> Optional[ContractType]:
    ct = await get_contract_type(db, contract_type_id)
    if not ct:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(ct, field, value)
    ct.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return ct


# ── Lawyer Assignment service ─────────────────────────────────────────────────

async def assign_lawyer_to_type(
    db: AsyncSession,
    data: LawyerAssignmentCreate,
    assigned_by: str
) -> LawyerAssignment:
    assignment = LawyerAssignment(
        lawyer_user_id=data.lawyer_user_id,
        lawyer_name=data.lawyer_name,
        lawyer_email=data.lawyer_email,
        contract_type_id=data.contract_type_id,
        assigned_by=assigned_by
    )
    db.add(assignment)
    await db.flush()
    return assignment


async def deactivate_lawyer_assignment(
    db: AsyncSession,
    assignment_id: str
) -> Optional[LawyerAssignment]:
    result = await db.execute(
        select(LawyerAssignment).where(LawyerAssignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment:
        assignment.is_active = False
    return assignment


# ── Envelope service ──────────────────────────────────────────────────────────

async def create_envelope(
    db: AsyncSession,
    data: EnvelopeCreate,
    company_id: str,
    company_name: str,
    user_id: str,
    user_name: str,
    user_email: str,
    ip_address: Optional[str] = None
) -> Envelope:
    """Creates a new envelope in borrador status."""
    ct = await get_contract_type(db, data.contract_type_id)
    if not ct:
        raise ValueError("Contract type not found")

    folio = await generate_folio(db)

    envelope = Envelope(
        folio=folio,
        company_id=company_id,
        company_name=company_name,
        requested_by_user_id=user_id,
        requested_by_name=user_name,
        requested_by_email=user_email,
        contract_type_id=data.contract_type_id,
        contract_type_name=ct.name,
        status="borrador",
        form_data=data.form_data,
        counterparty_name=data.counterparty_name,
        counterparty_email=str(data.counterparty_email) if data.counterparty_email else None,
        is_open_request=data.is_open_request,
        open_request_description=data.open_request_description,
    )
    db.add(envelope)
    await db.flush()

    await log_status_change(
        db, envelope.id, None, "borrador",
        user_id, user_name, "cliente", ip_address=ip_address
    )
    await open_time_tracking(db, envelope.id, "borrador", user_id, user_name)
    await log_activity(
        db, envelope.id, "created",
        user_id, user_name, "cliente",
        ip_address=ip_address,
        detail={"folio": folio, "contract_type": ct.name}
    )

    return envelope


async def submit_envelope(
    db: AsyncSession,
    envelope_id: str,
    data: EnvelopeSubmit,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None
) -> Envelope:
    """
    Client submits the envelope — transitions from borrador or pendiente_cliente
    to pendiente_legal or en_revision_legal respectively.
    Assigns a lawyer via balancing logic.
    Starts SLA counter on first submission.
    Saves a form snapshot.
    """
    result = await db.execute(
        select(Envelope).where(
            and_(Envelope.id == envelope_id, Envelope.is_deleted == False)
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise ValueError("Envelope not found")

    from_status = envelope.status
    is_first_submission = from_status == "borrador"
    to_status = "pendiente_legal" if is_first_submission else "en_revision_legal"

    if not validate_transition(from_status, to_status):
        raise ValueError(f"Invalid transition: {from_status} → {to_status}")

    if data.form_data:
        old_form = envelope.form_data
        envelope.form_data = data.form_data
        await log_activity(
            db, envelope.id, "form_updated",
            user_id, user_name, user_role,
            ip_address=ip_address,
            detail={"old": old_form, "new": data.form_data}
        )
    if data.counterparty_name:
        envelope.counterparty_name = data.counterparty_name
    if data.counterparty_email:
        envelope.counterparty_email = str(data.counterparty_email)

    snapshot_count_result = await db.execute(
        select(func.count(EnvelopeFormSnapshot.id)).where(
            EnvelopeFormSnapshot.envelope_id == envelope_id
        )
    )
    version = (snapshot_count_result.scalar() or 0) + 1
    snapshot = EnvelopeFormSnapshot(
        envelope_id=envelope_id,
        version=version,
        form_data=envelope.form_data or {},
        submitted_by_user_id=user_id,
        submitted_by_name=user_name,
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(snapshot)

    if is_first_submission:
        lawyer = await assign_lawyer(db, envelope.contract_type_id)
        if lawyer:
            envelope.assigned_lawyer_id = lawyer["lawyer_user_id"]
            envelope.assigned_lawyer_name = lawyer["lawyer_name"]
            envelope.assigned_lawyer_email = lawyer["lawyer_email"]
            envelope.assigned_at = datetime.now(timezone.utc)
            await log_activity(
                db, envelope.id, "lawyer_assigned",
                user_id, user_name, user_role,
                detail={"lawyer": lawyer["lawyer_name"]}
            )

        envelope.submitted_at = datetime.now(timezone.utc)
        ct = await get_contract_type(db, envelope.contract_type_id)
        if ct:
            envelope.sla_due_at = add_business_days(envelope.submitted_at, ct.sla_business_days)

    await close_time_tracking(db, envelope_id, from_status)
    envelope.status = to_status
    envelope.updated_at = datetime.now(timezone.utc)
    await open_time_tracking(
        db, envelope_id, to_status,
        envelope.assigned_lawyer_id, envelope.assigned_lawyer_name
    )
    await log_status_change(
        db, envelope_id, from_status, to_status,
        user_id, user_name, user_role, ip_address=ip_address
    )
    await log_activity(
        db, envelope_id, "submitted",
        user_id, user_name, user_role, ip_address=ip_address,
        detail={"from": from_status, "to": to_status, "version": version}
    )

    await db.flush()
    return envelope


async def approve_envelope(
    db: AsyncSession,
    envelope_id: str,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None
) -> Envelope:
    """Lawyer approves — transitions to en_firmas. Closes SLA."""
    result = await db.execute(
        select(Envelope).where(
            and_(Envelope.id == envelope_id, Envelope.is_deleted == False)
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise ValueError("Envelope not found")

    from_status = envelope.status
    to_status = "en_firmas"

    if not validate_transition(from_status, to_status):
        raise ValueError(f"Invalid transition: {from_status} → {to_status}")

    await close_time_tracking(db, envelope_id, from_status)
    envelope.status = to_status
    envelope.sla_closed_at = datetime.now(timezone.utc)
    envelope.updated_at = datetime.now(timezone.utc)
    await open_time_tracking(db, envelope_id, to_status, user_id, user_name)
    await log_status_change(
        db, envelope_id, from_status, to_status,
        user_id, user_name, user_role, ip_address=ip_address
    )
    await log_activity(
        db, envelope_id, "approved",
        user_id, user_name, user_role, ip_address=ip_address
    )

    await db.flush()
    return envelope


async def request_corrections(
    db: AsyncSession,
    envelope_id: str,
    reason: str,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None
) -> Envelope:
    """Lawyer requests corrections — transitions to pendiente_cliente."""
    result = await db.execute(
        select(Envelope).where(
            and_(Envelope.id == envelope_id, Envelope.is_deleted == False)
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise ValueError("Envelope not found")

    from_status = envelope.status
    to_status = "pendiente_cliente"

    if not validate_transition(from_status, to_status):
        raise ValueError(f"Invalid transition: {from_status} → {to_status}")

    await close_time_tracking(db, envelope_id, from_status)
    envelope.status = to_status
    envelope.updated_at = datetime.now(timezone.utc)
    await open_time_tracking(
        db, envelope_id, to_status,
        envelope.requested_by_user_id, envelope.requested_by_name
    )
    await log_status_change(
        db, envelope_id, from_status, to_status,
        user_id, user_name, user_role, reason=reason, ip_address=ip_address
    )
    await log_activity(
        db, envelope_id, "corrections_requested",
        user_id, user_name, user_role, ip_address=ip_address,
        detail={"reason": reason}
    )

    await db.flush()
    return envelope


async def reject_envelope(
    db: AsyncSession,
    envelope_id: str,
    reason: str,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None
) -> Envelope:
    """Lawyer rejects — transitions to rechazado. Closes SLA. Immutable."""
    result = await db.execute(
        select(Envelope).where(
            and_(Envelope.id == envelope_id, Envelope.is_deleted == False)
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise ValueError("Envelope not found")

    from_status = envelope.status
    to_status = "rechazado"

    if not validate_transition(from_status, to_status):
        raise ValueError(f"Invalid transition: {from_status} → {to_status}")

    await close_time_tracking(db, envelope_id, from_status)
    envelope.status = to_status
    envelope.sla_closed_at = datetime.now(timezone.utc)
    envelope.updated_at = datetime.now(timezone.utc)
    await log_status_change(
        db, envelope_id, from_status, to_status,
        user_id, user_name, user_role, reason=reason, ip_address=ip_address
    )
    await log_activity(
        db, envelope_id, "rejected",
        user_id, user_name, user_role, ip_address=ip_address,
        detail={"reason": reason}
    )

    await db.flush()
    return envelope


async def complete_envelope(
    db: AsyncSession,
    envelope_id: str,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None
) -> Envelope:
    """Marks an envelope as completado when all signatures are collected."""
    result = await db.execute(
        select(Envelope).where(
            and_(Envelope.id == envelope_id, Envelope.is_deleted == False)
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise ValueError("Envelope not found")

    from_status = envelope.status
    to_status = "completado"

    if not validate_transition(from_status, to_status):
        raise ValueError(f"Invalid transition: {from_status} → {to_status}")

    await close_time_tracking(db, envelope_id, from_status)
    envelope.status = to_status
    envelope.completed_at = datetime.now(timezone.utc)
    envelope.updated_at = datetime.now(timezone.utc)
    await log_status_change(
        db, envelope_id, from_status, to_status,
        user_id, user_name, user_role, ip_address=ip_address
    )
    await log_activity(
        db, envelope_id, "completed",
        user_id, user_name, user_role, ip_address=ip_address
    )

    await db.flush()
    return envelope


async def reassign_lawyer(
    db: AsyncSession,
    envelope_id: str,
    new_lawyer_id: str,
    new_lawyer_name: str,
    new_lawyer_email: str,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None
) -> Envelope:
    """
    Coordinator reassigns an envelope to a different lawyer.
    SLA counter does not reset.
    """
    result = await db.execute(
        select(Envelope).where(
            and_(Envelope.id == envelope_id, Envelope.is_deleted == False)
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise ValueError("Envelope not found")

    if envelope.status in ["completado", "rechazado"]:
        raise ValueError("Cannot reassign a closed envelope")

    old_lawyer = envelope.assigned_lawyer_name
    envelope.assigned_lawyer_id = new_lawyer_id
    envelope.assigned_lawyer_name = new_lawyer_name
    envelope.assigned_lawyer_email = new_lawyer_email
    envelope.assigned_at = datetime.now(timezone.utc)
    envelope.updated_at = datetime.now(timezone.utc)

    await log_activity(
        db, envelope_id, "lawyer_reassigned",
        user_id, user_name, user_role, ip_address=ip_address,
        detail={"old_lawyer": old_lawyer, "new_lawyer": new_lawyer_name}
    )

    await db.flush()
    return envelope


async def update_sla_breach_flags(db: AsyncSession) -> int:
    """
    Marks all overdue open envelopes as is_sla_breached = True.
    Called by the daily SLA report cron.
    Returns the number of updated records.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Envelope).where(
            and_(
                Envelope.sla_due_at < now,
                Envelope.sla_closed_at == None,
                Envelope.is_sla_breached == False,
                Envelope.is_deleted == False
            )
        )
    )
    envelopes = result.scalars().all()
    for env in envelopes:
        env.is_sla_breached = True
    await db.flush()
    return len(envelopes)


async def get_envelope(
    db: AsyncSession,
    envelope_id: str
) -> Optional[Envelope]:
    result = await db.execute(
        select(Envelope).where(
            and_(Envelope.id == envelope_id, Envelope.is_deleted == False)
        )
    )
    return result.scalar_one_or_none()


async def list_envelopes(
    db: AsyncSession,
    company_id: Optional[str] = None,
    lawyer_id: Optional[str] = None,
    status: Optional[str] = None,
    contract_type_id: Optional[str] = None,
    is_sla_breached: Optional[bool] = None,
    page: int = 1,
    per_page: int = 20
) -> Tuple[List[Envelope], int]:
    q = select(Envelope).where(Envelope.is_deleted == False)
    if company_id:
        q = q.where(Envelope.company_id == company_id)
    if lawyer_id:
        q = q.where(Envelope.assigned_lawyer_id == lawyer_id)
    if status:
        q = q.where(Envelope.status == status)
    if contract_type_id:
        q = q.where(Envelope.contract_type_id == contract_type_id)
    if is_sla_breached is not None:
        q = q.where(Envelope.is_sla_breached == is_sla_breached)

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar() or 0

    q = q.order_by(Envelope.created_at.desc())
    q = q.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    return result.scalars().all(), total


async def add_comment(
    db: AsyncSession,
    envelope_id: str,
    data: EnvelopeCommentCreate,
    user_id: str,
    user_name: str,
    user_role: str,
    ip_address: Optional[str] = None
) -> EnvelopeComment:
    comment = EnvelopeComment(
        envelope_id=envelope_id,
        author_user_id=user_id,
        author_name=user_name,
        author_role=user_role,
        body=data.body,
        is_internal=data.is_internal
    )
    db.add(comment)
    await log_activity(
        db, envelope_id, "comment_added",
        user_id, user_name, user_role, ip_address=ip_address,
        detail={"is_internal": data.is_internal}
    )
    await db.flush()
    return comment


async def get_envelope_comments(
    db: AsyncSession,
    envelope_id: str,
    include_internal: bool = False
) -> List[EnvelopeComment]:
    q = select(EnvelopeComment).where(
        and_(
            EnvelopeComment.envelope_id == envelope_id,
            EnvelopeComment.is_deleted == False
        )
    )
    if not include_internal:
        q = q.where(EnvelopeComment.is_internal == False)
    q = q.order_by(EnvelopeComment.created_at.asc())
    result = await db.execute(q)
    return result.scalars().all()


async def get_envelope_status_log(
    db: AsyncSession,
    envelope_id: str
) -> List[EnvelopeStatusLog]:
    result = await db.execute(
        select(EnvelopeStatusLog)
        .where(EnvelopeStatusLog.envelope_id == envelope_id)
        .order_by(EnvelopeStatusLog.changed_at.asc())
    )
    return result.scalars().all()


async def get_envelope_time_tracking(
    db: AsyncSession,
    envelope_id: str
) -> List[EnvelopeTimeTracking]:
    result = await db.execute(
        select(EnvelopeTimeTracking)
        .where(EnvelopeTimeTracking.envelope_id == envelope_id)
        .order_by(EnvelopeTimeTracking.started_at.asc())
    )
    return result.scalars().all()


async def get_envelope_activity_log(
    db: AsyncSession,
    envelope_id: str
) -> List[EnvelopeActivityLog]:
    result = await db.execute(
        select(EnvelopeActivityLog)
        .where(EnvelopeActivityLog.envelope_id == envelope_id)
        .order_by(EnvelopeActivityLog.performed_at.asc())
    )
    return result.scalars().all()


async def get_envelope_form_snapshots(
    db: AsyncSession,
    envelope_id: str
) -> List[EnvelopeFormSnapshot]:
    result = await db.execute(
        select(EnvelopeFormSnapshot)
        .where(EnvelopeFormSnapshot.envelope_id == envelope_id)
        .order_by(EnvelopeFormSnapshot.version.asc())
    )
    return result.scalars().all()


async def get_envelope_attachments(
    db: AsyncSession,
    envelope_id: str
) -> List[EnvelopeAttachment]:
    result = await db.execute(
        select(EnvelopeAttachment)
        .where(
            and_(
                EnvelopeAttachment.envelope_id == envelope_id,
                EnvelopeAttachment.is_deleted == False
            )
        )
        .order_by(EnvelopeAttachment.uploaded_at.asc())
    )
    return result.scalars().all()