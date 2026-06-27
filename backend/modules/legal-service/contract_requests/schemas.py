from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any, Dict
from datetime import datetime
from enum import Enum


class EnvelopeStatus(str, Enum):
    borrador = "borrador"
    pendiente_legal = "pendiente_legal"
    pendiente_cliente = "pendiente_cliente"
    en_revision_legal = "en_revision_legal"
    en_firmas = "en_firmas"
    firmado_parcial = "firmado_parcial"
    completado = "completado"
    rechazado = "rechazado"


class SLAColor(str, Enum):
    green = "green"
    yellow = "yellow"
    red = "red"


# ── Contract Type ─────────────────────────────────────────────────────────────

class ContractTypeFieldOut(BaseModel):
    id: str
    label: str
    field_key: str
    field_type: str
    placeholder: Optional[str] = None
    options: Optional[List[Any]] = None
    is_required: bool
    display_order: int

    class Config:
        from_attributes = True


class ContractTypeAttachmentDefOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    is_required: bool
    display_order: int

    class Config:
        from_attributes = True


class ContractTypeOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    sla_business_days: int
    is_active: bool
    fields: List[ContractTypeFieldOut] = []
    attachment_defs: List[ContractTypeAttachmentDefOut] = []

    class Config:
        from_attributes = True


class ContractTypeCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    sla_business_days: int = Field(default=3, ge=1)


class ContractTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    sla_business_days: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None


# ── Lawyer Assignment ─────────────────────────────────────────────────────────

class LawyerAssignmentCreate(BaseModel):
    lawyer_user_id: str
    lawyer_name: str
    lawyer_email: EmailStr
    contract_type_id: str


class LawyerAssignmentOut(BaseModel):
    id: str
    lawyer_user_id: str
    lawyer_name: str
    lawyer_email: str
    contract_type_id: str
    is_active: bool
    assigned_at: datetime

    class Config:
        from_attributes = True


# ── Envelope ──────────────────────────────────────────────────────────────────

class EnvelopeCreate(BaseModel):
    contract_type_id: str
    form_data: Optional[Dict[str, Any]] = None
    counterparty_name: Optional[str] = Field(None, max_length=255)
    counterparty_email: Optional[EmailStr] = None
    is_open_request: bool = False
    open_request_description: Optional[str] = None
    company_id: Optional[str] = None


class EnvelopeUpdate(BaseModel):
    form_data: Optional[Dict[str, Any]] = None
    counterparty_name: Optional[str] = Field(None, max_length=255)
    counterparty_email: Optional[EmailStr] = None
    open_request_description: Optional[str] = None


class EnvelopeSubmit(BaseModel):
    form_data: Optional[Dict[str, Any]] = None
    counterparty_name: Optional[str] = None
    counterparty_email: Optional[EmailStr] = None


class EnvelopeStatusChange(BaseModel):
    reason: Optional[str] = None


class EnvelopeReject(BaseModel):
    reason: str = Field(..., min_length=10)


class EnvelopeRequestCorrections(BaseModel):
    reason: str = Field(..., min_length=10)


class SLAInfo(BaseModel):
    submitted_at: Optional[datetime]
    sla_due_at: Optional[datetime]
    business_days_elapsed: Optional[int]
    business_days_remaining: Optional[int]
    is_breached: bool
    color: SLAColor


class EnvelopeOut(BaseModel):
    id: str
    folio: str
    company_id: str
    company_name: str
    requested_by_user_id: str
    requested_by_name: str
    requested_by_email: str
    contract_type_id: str
    contract_type_name: str
    assigned_lawyer_id: Optional[str] = None
    assigned_lawyer_name: Optional[str] = None
    assigned_lawyer_email: Optional[str] = None
    assigned_at: Optional[datetime] = None
    status: EnvelopeStatus
    form_data: Optional[Dict[str, Any]] = None
    counterparty_name: Optional[str] = None
    counterparty_email: Optional[str] = None
    is_open_request: bool
    open_request_description: Optional[str] = None
    submitted_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    sla_closed_at: Optional[datetime] = None
    is_sla_breached: bool
    sla: Optional[SLAInfo] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EnvelopeListItem(BaseModel):
    id: str
    folio: str
    company_name: str
    requested_by_name: str
    contract_type_name: str
    assigned_lawyer_name: Optional[str] = None
    status: EnvelopeStatus
    is_open_request: bool
    submitted_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    is_sla_breached: bool
    sla_color: SLAColor
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Status Log ────────────────────────────────────────────────────────────────

class EnvelopeStatusLogOut(BaseModel):
    id: str
    from_status: Optional[str] = None
    to_status: str
    changed_by_name: str
    changed_by_role: str
    reason: Optional[str] = None
    changed_at: datetime

    class Config:
        from_attributes = True


# ── Time Tracking ─────────────────────────────────────────────────────────────

class EnvelopeTimeTrackingOut(BaseModel):
    id: str
    status: str
    responsible_user_name: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None

    class Config:
        from_attributes = True


# ── Comments ──────────────────────────────────────────────────────────────────

class EnvelopeCommentCreate(BaseModel):
    body: str = Field(..., min_length=1)
    is_internal: bool = False


class EnvelopeCommentOut(BaseModel):
    id: str
    author_name: str
    author_role: str
    body: str
    is_internal: bool
    created_at: datetime
    edited_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Attachments ───────────────────────────────────────────────────────────────

class EnvelopeAttachmentOut(BaseModel):
    id: str
    original_name: str
    mime_type: str
    extension: str
    size_bytes: int
    description: Optional[str] = None
    uploaded_by_name: str
    uploaded_at: datetime
    download_url: Optional[str] = None
    object_key: Optional[str] = None
    bucket: Optional[str] = None
    is_current: Optional[bool] = True
    version_number: Optional[int] = 1
    attachment_def_id: Optional[str] = None

    class Config:
        from_attributes = True


class EnvelopeAttachmentLogOut(BaseModel):
    id: str
    action: str
    performed_by_name: str
    performed_at: datetime
    detail: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


# ── Activity Log ──────────────────────────────────────────────────────────────

class EnvelopeActivityLogOut(BaseModel):
    id: str
    action: str
    performed_by_name: str
    performed_by_role: str
    performed_at: datetime
    detail: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


# ── Form Snapshot ─────────────────────────────────────────────────────────────

class EnvelopeFormSnapshotOut(BaseModel):
    id: str
    version: int
    form_data: Dict[str, Any]
    submitted_by_name: str
    submitted_at: datetime

    class Config:
        from_attributes = True


# ── Full Detail ───────────────────────────────────────────────────────────────

class EnvelopeDetail(BaseModel):
    envelope: EnvelopeOut
    status_log: List[EnvelopeStatusLogOut] = []
    time_tracking: List[EnvelopeTimeTrackingOut] = []
    comments: List[EnvelopeCommentOut] = []
    attachments: List[EnvelopeAttachmentOut] = []
    form_snapshots: List[EnvelopeFormSnapshotOut] = []
    activity_log: List[EnvelopeActivityLogOut] = []


# ── Pagination ────────────────────────────────────────────────────────────────

class PaginatedEnvelopes(BaseModel):
    data: List[EnvelopeListItem]
    total: int
    page: int
    per_page: int
    total_pages: int


# ── SLA Report ────────────────────────────────────────────────────────────────

class SLAReportItem(BaseModel):
    folio: str
    company_name: str
    requested_by_name: str
    contract_type_name: str
    assigned_lawyer_name: Optional[str] = None
    status: EnvelopeStatus
    submitted_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    days_overdue: int
    side: str  # "legal" or "client"


class SLAReport(BaseModel):
    generated_at: datetime
    overdue_count: int
    on_time_count: int
    in_signatures_count: int
    overdue_items: List[SLAReportItem] = []
    in_signatures_items: List[EnvelopeListItem] = []