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
    is_active             = Column(Boolean, nullable=False, default=True)
    template_slug         = Column(String(100), nullable=True)
    template_version      = Column(String(20),  nullable=True, default="1.0")
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
    is_required           = Column(Boolean, nullable=False, default=True)
    display_order         = Column(Integer, nullable=False, default=0)
    allowed_mime_types    = Column(JSON, nullable=True)


class LawyerAssignment(Base):
    """Assignment of lawyers to contract types for envelope routing."""
    __tablename__ = "lawyer_assignments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    lawyer_user_id = Column(UUID(as_uuid=False), nullable=False)
    lawyer_name = Column(String(255), nullable=False)
    lawyer_email = Column(String(255), nullable=False)
    contract_type_id = Column(UUID(as_uuid=False), ForeignKey("contract_types.id", ondelete="CASCADE"), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    assigned_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    assigned_by = Column(UUID(as_uuid=False), nullable=False)


class Envelope(Base):
    """Main envelope entity with full state machine and traceability."""
    __tablename__ = "envelopes"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    folio = Column(String(20), nullable=False, unique=True)  # ENV-2026-0001

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
            name="envelope_status_enum"
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
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    sla_due_at = Column(DateTime(timezone=True), nullable=True)
    sla_closed_at = Column(DateTime(timezone=True), nullable=True)
    is_sla_breached = Column(Boolean, nullable=False, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    correction_checklist  = Column(JSON, nullable=True)

    # Intercompany
    is_intercompany          = Column(Boolean, nullable=False, default=False)
    counterparty_company_id  = Column(UUID(as_uuid=False), nullable=True)

    # DocuSign
    docusign_envelope_id  = Column(String(100), nullable=True)  # envelopeId retornado por DocuSign
    # Soft delete
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by = Column(UUID(as_uuid=False), nullable=True)


class EnvelopeFormSnapshot(Base):
    """Immutable snapshot of form data each time client submits or resubmits."""
    __tablename__ = "envelope_form_snapshots"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    form_data = Column(JSON, nullable=False)
    submitted_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    submitted_by_name = Column(String(255), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class EnvelopeStatusLog(Base):
    """Immutable log of every status transition — who, when, from, to, why."""
    __tablename__ = "envelope_status_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    changed_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    changed_by_name = Column(String(255), nullable=False)
    changed_by_role = Column(String(100), nullable=False)
    reason = Column(Text, nullable=True)
    changed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)


class EnvelopeTimeTracking(Base):
    """Records time spent in each status for SLA diagnosis and reporting."""
    __tablename__ = "envelope_time_tracking"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False)
    responsible_user_id = Column(UUID(as_uuid=False), nullable=True)
    responsible_user_name = Column(String(255), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)


class EnvelopeComment(Base):
    """Comments on an envelope — internal (legal only) or public (visible to client)."""
    __tablename__ = "envelope_comments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    author_user_id = Column(UUID(as_uuid=False), nullable=False)
    author_name = Column(String(255), nullable=False)
    author_role = Column(String(100), nullable=False)
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class EnvelopeAttachment(Base):
    """Files attached to an envelope with full audit trail."""
    __tablename__ = "envelope_attachments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    attachment_def_id = Column(UUID(as_uuid=False), ForeignKey("contract_type_attachment_defs.id"), nullable=True)
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    object_key = Column(String(500), nullable=False)
    bucket = Column(String(100), nullable=False, default="dirdoc")
    mime_type = Column(String(100), nullable=False)
    extension = Column(String(20), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    checksum = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    uploaded_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    uploaded_by_name = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    version_number      = Column(Integer, nullable=False, default=1)
    is_current          = Column(Boolean, nullable=False, default=True)
    document_type       = Column(String(50), nullable=True)
    replaced_at         = Column(DateTime(timezone=True), nullable=True)
    replaced_by_user_id = Column(UUID(as_uuid=False), nullable=True)
    replaced_by_name    = Column(String(255), nullable=True)
    replaced_reason     = Column(Text, nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by = Column(UUID(as_uuid=False), nullable=True)


class EnvelopeAttachmentLog(Base):
    """Audit log for every action on envelope attachments."""
    __tablename__ = "envelope_attachment_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    attachment_id = Column(UUID(as_uuid=False), ForeignKey("envelope_attachments.id", ondelete="CASCADE"), nullable=False)
    envelope_id = Column(UUID(as_uuid=False), nullable=False)
    action = Column(String(50), nullable=False)  # uploaded, downloaded, deleted
    performed_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    performed_by_name = Column(String(255), nullable=False)
    performed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)
    detail = Column(JSON, nullable=True)


class EnvelopeActivityLog(Base):
    """General activity log — views, downloads, edits, assignments, and any other action."""
    __tablename__ = "envelope_activity_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(100), nullable=False)
    performed_by_user_id = Column(UUID(as_uuid=False), nullable=False)
    performed_by_name = Column(String(255), nullable=False)
    performed_by_role = Column(String(100), nullable=False)
    performed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)
    detail = Column(JSON, nullable=True)



class EnvelopeDocuSignAuditEvent(Base):
    """Registro interno de los eventos de auditoria que devuelve DocuSign
    (audit_events). No es para el reporte de auditoria de usuarios — es
    respaldo tecnico por si sistemas necesita rastrear algo del proceso
    de firma (IPs, geolocalizacion, idioma usado, timestamps exactos)."""
    __tablename__ = "envelope_docusign_audit_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    docusign_envelope_id = Column(String(100), nullable=False)

    log_time = Column(DateTime(timezone=True), nullable=True)
    source = Column(String(20), nullable=True)
    user_name = Column(String(255), nullable=True)
    docusign_user_id = Column(String(100), nullable=True)
    action = Column(String(100), nullable=True)
    message = Column(Text, nullable=True)
    envelope_status = Column(String(50), nullable=True)
    client_ip = Column(String(45), nullable=True)
    information = Column(Text, nullable=True)
    information_localized = Column(JSON, nullable=True)
    geo_location = Column(String(255), nullable=True)
    language = Column(String(50), nullable=True)

    raw_event = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class EnvelopeSigner(Base):
    """Signers assigned to an envelope — one row per signer, supports multiple signers per envelope."""
    __tablename__ = "envelope_signers"

    id                    = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id           = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    signer_type           = Column(String(20), nullable=False)   # internal | external
    user_id               = Column(UUID(as_uuid=False), nullable=True)   # UUID en avalanz si es interno
    name                  = Column(String(255), nullable=False)
    email                 = Column(String(255), nullable=False)
    role_in_document      = Column(String(100), nullable=True)   # Representante Legal | Testigo | Contraparte
    routing_order         = Column(Integer, nullable=False, default=1)
    docusign_recipient_id = Column(String(100), nullable=True)
    status                = Column(String(30), nullable=False, default="pending")  # pending | sent | signed | declined
    signed_at             = Column(DateTime(timezone=True), nullable=True)
    declined_at           = Column(DateTime(timezone=True), nullable=True)
    declined_reason       = Column(Text, nullable=True)
    docs_requested        = Column(JSON, nullable=True)  # [{"type": "INE"}, {"type": "poder_notarial"}]
    docs_received         = Column(JSON, nullable=True)  # docs recuperados de DocuSign post-firma
    # DocuSign tabs — posición de firma en el documento
    sign_here_anchor      = Column(String(50), nullable=True)   # anchorString del signHereTabs
    full_name_anchor      = Column(String(50), nullable=True)   # anchorString del fullNameTabs
    date_signed_anchor    = Column(String(50), nullable=True)   # anchorString del dateSignedTabs
    # DocuSign Embedded Signing
    client_user_id        = Column(String(100), nullable=True)  # clientUserId para firma incorporada
    # Notificación personalizada por firmante
    email_subject         = Column(String(255), nullable=True)  # emailSubject personalizado
    email_blurb           = Column(Text, nullable=True)         # emailBlurb personalizado
    created_at            = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at            = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class EnvelopeSigningToken(Base):
    """Token único por firmante para simulación de firma por correo."""
    __tablename__ = "envelope_signing_tokens"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    envelope_id  = Column(UUID(as_uuid=False), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False)
    signer_id    = Column(UUID(as_uuid=False), ForeignKey("envelope_signers.id", ondelete="CASCADE"), nullable=True)
    signer_name  = Column(String(255), nullable=False)
    signer_email = Column(String(255), nullable=False)
    token        = Column(String(128), nullable=False, unique=True)
    status       = Column(String(30), nullable=False, default="pending")
    signed_at    = Column(DateTime(timezone=True), nullable=True)
    expires_at   = Column(DateTime(timezone=True), nullable=False)
    created_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class SigningProviderConfig(Base):
    """Configuración del proveedor de firma — una sola fila con id=1."""
    __tablename__ = "signing_provider_config"

    id         = Column(Integer, primary_key=True)
    provider   = Column(String(30), nullable=False, default="email_sim")
    updated_by = Column(UUID(as_uuid=False), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class FolioSequence(Base):
    """Controls the auto-increment folio counter per year — ENV-2026-0001."""
    __tablename__ = "folio_sequences"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False, unique=True)
    last_sequence = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)