import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Text, Integer,
    ForeignKey, Enum as SAEnum, BigInteger, JSON, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def gen_uuid():
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────
# Catálogos
# ─────────────────────────────────────────────────────────────────────────

class TicketSeverity(Base):
    """Catálogo de severidades S1-S4. Configurable por incident_manager."""
    __tablename__ = "ticket_severities"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    code = Column(String(4), nullable=False, unique=True)
    name = Column(String(50), nullable=False)
    response_sla_minutes = Column(Integer, nullable=False)
    resolution_sla_hours = Column(Integer, nullable=False)
    is_24_7 = Column(Boolean, nullable=False, default=False)
    rca_mandatory = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class TicketSystem(Base):
    """Catálogo abierto de sistemas (TOTVS, Odoo, Edicom, ...). Crece según se necesite."""
    __tablename__ = "ticket_systems"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(150), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class TicketModule(Base):
    """Módulos dentro de cada sistema (ej. Contabilidad en TOTVS, Facturación en Odoo)."""
    __tablename__ = "ticket_modules"
    __table_args__ = (UniqueConstraint("system_id", "name", name="uq_ticket_modules_system_name"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    system_id = Column(UUID(as_uuid=False), ForeignKey("ticket_systems.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemSpecialist(Base):
    """Catálogo central del motor de asignación — a quién le toca cada sistema/módulo.

    system_id y module_id ambos NULL = especialista general del equipo (catch-all).
    system_id con valor y module_id NULL = técnico a nivel sistema completo.
    Ambos con valor = técnico específico para ese módulo puntual (el más específico).
    """
    __tablename__ = "system_specialists"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    system_id = Column(UUID(as_uuid=False), ForeignKey("ticket_systems.id", ondelete="CASCADE"), nullable=True)
    module_id = Column(UUID(as_uuid=False), ForeignKey("ticket_modules.id", ondelete="CASCADE"), nullable=True)
    team_type = Column(String(30), nullable=False)
    specialist_user_id = Column(UUID(as_uuid=False), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class FolioCounter(Base):
    """Consecutivo atómico por familia — SELECT ... FOR UPDATE al generar un folio."""
    __tablename__ = "folio_counters"
    __table_args__ = (UniqueConstraint("prefix", "family_clave", name="uq_folio_counters_prefix_family"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    prefix = Column(String(3), nullable=False)
    family_clave = Column(String(4), nullable=False)
    last_number = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class IncidenciaSetting(Base):
    """Configuración clave/valor del submódulo (ej. backlog_digest_frequency_hours)."""
    __tablename__ = "incidencias_settings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(String(255), nullable=False)
    updated_by = Column(UUID(as_uuid=False), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────
# Entidad principal
# ─────────────────────────────────────────────────────────────────────────

class Incident(Base):
    """Ticket de Incidencias — folio INC-{FAMILIA}-{consecutivo}."""
    __tablename__ = "incidents"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    folio = Column(String(15), nullable=False, unique=True)
    title = Column(String(150), nullable=False)

    company_id = Column(UUID(as_uuid=False), nullable=False)

    requester_id = Column(UUID(as_uuid=False), nullable=False)
    requester_name = Column(String(255), nullable=False)
    requester_phone = Column(String(20), nullable=True)
    requester_puesto = Column(String(255), nullable=True)
    requester_area = Column(String(255), nullable=True)
    requester_company_name = Column(String(255), nullable=False)

    system_id = Column(UUID(as_uuid=False), ForeignKey("ticket_systems.id"), nullable=False)
    module_id = Column(UUID(as_uuid=False), ForeignKey("ticket_modules.id"), nullable=True)
    reported_type = Column(String(20), nullable=True)
    description = Column(Text, nullable=False)

    severity_reported_id = Column(UUID(as_uuid=False), ForeignKey("ticket_severities.id"), nullable=False)
    severity_validated_id = Column(UUID(as_uuid=False), ForeignKey("ticket_severities.id"), nullable=True)

    assigned_team = Column(String(30), nullable=True)
    assigned_to_user_id = Column(UUID(as_uuid=False), nullable=True)

    attention_level = Column(String(5), nullable=True)
    first_response_at = Column(DateTime(timezone=True), nullable=True)

    sla_response_limit = Column(DateTime(timezone=True), nullable=True)
    sla_resolution_limit = Column(DateTime(timezone=True), nullable=True)
    is_sla_breached = Column(Boolean, nullable=False, default=False)

    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_type = Column(String(20), nullable=True)

    reopen_window_expires_at = Column(DateTime(timezone=True), nullable=True)
    reopened_at = Column(DateTime(timezone=True), nullable=True)
    reopen_count = Column(Integer, nullable=False, default=0)
    related_incident_id = Column(UUID(as_uuid=False), ForeignKey("incidents.id"), nullable=True)

    escalated_to = Column(String(30), nullable=False, default="no_aplica")
    escalated_at = Column(DateTime(timezone=True), nullable=True)

    rca_text = Column(Text, nullable=True)
    rca_due_date = Column(DateTime(timezone=True), nullable=True)

    closed_at = Column(DateTime(timezone=True), nullable=True)

    status = Column(
        SAEnum(
            "en_backlog", "asignado", "en_atencion", "escalado", "resuelto", "cerrado",
            name="incident_status_enum",
        ),
        nullable=False,
        default="en_backlog",
    )

    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────
# Tablas de apoyo
# ─────────────────────────────────────────────────────────────────────────

class IncidentAttachment(Base):
    """Evidencia adjunta — reutiliza upload-service, mismo patrón que envelope_attachments."""
    __tablename__ = "incident_attachments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    incident_id = Column(UUID(as_uuid=False), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    attachment_type = Column(
        SAEnum("evidencia_reporte", "evidencia_resolucion", name="incident_attachment_type_enum"),
        nullable=False,
    )
    reopen_cycle = Column(Integer, nullable=False, default=0)
    object_key = Column(String(500), nullable=False)
    bucket = Column(String(100), nullable=False, default="dirdoc")
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    uploaded_by = Column(UUID(as_uuid=False), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class IncidentActivityLog(Base):
    """Bitácora completa del ciclo de vida — mismo patrón que user_file_audit_log."""
    __tablename__ = "incident_activity_log"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    incident_id = Column(UUID(as_uuid=False), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(50), nullable=False)
    performed_by = Column(UUID(as_uuid=False), nullable=False)
    performed_by_name = Column(String(255), nullable=False)
    performed_by_role = Column(String(100), nullable=False)
    performed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    company_id = Column(UUID(as_uuid=False), nullable=True)
    module_slug = Column(String(100), nullable=False, default="it-service-desk")
    detail = Column(JSON, nullable=True)


class IncidentResolutionToken(Base):
    """Enlace seguro de un solo uso para resolver desde correo."""
    __tablename__ = "incident_resolution_tokens"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    incident_id = Column(UUID(as_uuid=False), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(128), nullable=False, unique=True)
    created_for_user_id = Column(UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
