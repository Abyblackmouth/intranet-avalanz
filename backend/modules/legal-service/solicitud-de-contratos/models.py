import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Text, Integer,
    ForeignKey, Enum as SAEnum, BigInteger, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def gen_uuid():
    return str(uuid.uuid4())


class ContractType(Base):
    """Catalog of contract types managed by legal team."""
    __tablename__ = "contract_types"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    sla_business_days = Column(Integer, nullable=False, default=3)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(UUID(as_uuid=False), nullable=True)


class ContractTypeField(Base):
    """Dynamic form fields for each contract type."""
    __tablename__ = "contract_type_fields"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_type_id = Column(UUID(as_uuid=False), ForeignKey("contract_types.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(255), nullable=False)
    field_key = Column(String(100), nullable=False)
    field_type = Column(String(50), nullable=False)  # text, textarea, date, select, number
    placeholder = Column(String(255), nullable=True)
    options = Column(JSON, nullable=True)  # for select fields
    is_required = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)


class ContractTypeAttachmentDef(Base):
    """Definition of required and optional attachments per contract type."""
    __tablename__ = "contract_type_attachment_defs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_type_id = Column(UUID(as_uuid=False), ForeignKey("contract_types.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_required = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)


class LawyerAssignment(Base):
    """Assignment of lawyers to contract types for request routing."""
    __tablename__ = "lawyer_assignments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    lawyer_user_id = Column(UUID(as_uuid=False), nullable=False)
    lawyer_name = Column(String(255), nullable=False)
    lawyer_email = Column(String(255), nullable=False)
    contract_type_id = Column(UUID(as_uuid=False), ForeignKey("contract_types.id", ondelete="CASCADE"), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    assigned_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    assigned_by = Column(UUID(as_uuid=False), nullable=False)


class ContractRequest(Base):
    """Main contract request entity with full state machine and traceability."""
    __tablename__ = "contract_requests"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    folio = Column(String(20), nullable=False, unique=True)  # CONT-2026-0001

    # Ownership
    company_id = Column(UUID(as_uuid=False), nullable=False)
    company_name = Column(String(255), nullable=False)
    requested_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    requested_by_name = Column(String(255), nullable=False)
    requested_by_email = Column(String(255), nullable=False)

    # Contract type
    contract_type_id = Column(UUID(as_uuid=False), ForeignKey("contract_types.id"), nullable=False)
    contract_type_name = Column(String(255), nullable=False)

    # Assignment
    assigned_lawyer_id = Column(UUID(as_uuid=False), nullable=True)
    assigned_lawyer_name = Column(String(255), nullable=True)
    assigned_lawyer_email = Column(String(255), nullable=True)
    assigned_at = Column(DateTime(timezone=True), nullable=True)

    # State machine
    status = Column(
        SAEnum(
            "borrador",
            "pendiente_legal",
            "pendiente_cliente",
            "en_revision_legal",
            "en_firmas",
            "firmado_parcial",
            "completado",
            "rechazado",
            name="contract_status_enum"
        ),
        nullable=False,
        default="borrador"
    )

    # Form data — stored as JSON snapshot
    form_data = Column(JSON, nullable=True)

    # Counterparty info
    counterparty_name = Column(String(255), nullable=True)
    counterparty_email = Column(String(255), nullable=True)

    # Free text request (when no template available)
    is_open_request = Column(Boolean, nullable=False, default=False)
    open_request_description = Column(Text, nullable=True)

    # SLA tracking
    submitted_at = Column(DateTime(timezone=True), nullable=True)  # when client first submits
    sla_due_at = Column(DateTime(timezone=True), nullable=True)    # calculated from submitted_at
    sla_closed_at = Column(DateTime(timezone=True), nullable=True) # when SLA stops counting
    is_sla_breached = Column(Boolean, nullable=False, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Soft delete
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by = Column(UUID(as_uuid=False), nullable=True)


class ContractFormSnapshot(Base):
    """Immutable snapshot of form data each time client submits or resubmits."""
    __tablename__ = "contract_form_snapshots"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_request_id = Column(UUID(as_uuid=False), ForeignKey("contract_requests.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    form_data = Column(JSON, nullable=False)
    submitted_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    submitted_by_name = Column(String(255), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class ContractStatusLog(Base):
    """Immutable log of every status transition — who, when, from, to, why."""
    __tablename__ = "contract_status_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_request_id = Column(UUID(as_uuid=False), ForeignKey("contract_requests.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    changed_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    changed_by_name = Column(String(255), nullable=False)
    changed_by_role = Column(String(100), nullable=False)
    reason = Column(Text, nullable=True)
    changed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)


class ContractTimeTracking(Base):
    """Records time spent in each status for SLA diagnosis and reporting."""
    __tablename__ = "contract_time_tracking"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_request_id = Column(UUID(as_uuid=False), ForeignKey("contract_requests.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False)
    responsible_user_id = Column(UUID(as_uuid=False), nullable=True)
    responsible_user_name = Column(String(255), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)  # calculated on close


class ContractComment(Base):
    """Comments on a contract request — internal (legal only) or public (visible to client)."""
    __tablename__ = "contract_comments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_request_id = Column(UUID(as_uuid=False), ForeignKey("contract_requests.id", ondelete="CASCADE"), nullable=False)
    author_user_id = Column(UUID(as_uuid=False), nullable=False)
    author_name = Column(String(255), nullable=False)
    author_role = Column(String(100), nullable=False)
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=False)  # True = legal only
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class ContractAttachment(Base):
    """Files attached to a contract request with full audit trail."""
    __tablename__ = "contract_attachments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_request_id = Column(UUID(as_uuid=False), ForeignKey("contract_requests.id", ondelete="CASCADE"), nullable=False)
    attachment_def_id = Column(UUID(as_uuid=False), ForeignKey("contract_type_attachment_defs.id"), nullable=True)
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    object_key = Column(String(500), nullable=False)
    bucket = Column(String(100), nullable=False, default="legal-contracts")
    mime_type = Column(String(100), nullable=False)
    extension = Column(String(20), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    checksum = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    uploaded_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    uploaded_by_name = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by = Column(UUID(as_uuid=False), nullable=True)


class ContractAttachmentLog(Base):
    """Audit log for every action on contract attachments."""
    __tablename__ = "contract_attachment_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    attachment_id = Column(UUID(as_uuid=False), ForeignKey("contract_attachments.id", ondelete="CASCADE"), nullable=False)
    contract_request_id = Column(UUID(as_uuid=False), nullable=False)
    action = Column(String(50), nullable=False)  # uploaded, downloaded, deleted
    performed_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    performed_by_name = Column(String(255), nullable=False)
    performed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)
    detail = Column(JSON, nullable=True)


class ContractActivityLog(Base):
    """General activity log — views, downloads, edits, assignments, and any other action."""
    __tablename__ = "contract_activity_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    contract_request_id = Column(UUID(as_uuid=False), ForeignKey("contract_requests.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(100), nullable=False)  # viewed, downloaded_contract, reassigned, field_edited, etc.
    performed_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    performed_by_name = Column(String(255), nullable=False)
    performed_by_role = Column(String(100), nullable=False)
    performed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)
    detail = Column(JSON, nullable=True)  # {"field": "counterparty_name", "old": "A", "new": "B"}


class FolioSequence(Base):
    """Controls the auto-increment folio counter per year — CONT-2026-0001."""
    __tablename__ = "folio_sequences"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False, unique=True)
    last_sequence = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
