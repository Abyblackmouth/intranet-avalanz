export type EnvelopeStatus =
  | 'borrador'
  | 'pendiente_legal'
  | 'pendiente_cliente'
  | 'en_revision_legal'
  | 'en_firmas'
  | 'firmado_parcial'
  | 'completado'
  | 'rechazado'

// Alias para compatibilidad
export type ContractStatus = EnvelopeStatus

export type SLAColor = 'green' | 'yellow' | 'red'

export interface SLAInfo {
  submitted_at: string | null
  sla_due_at: string | null
  business_days_elapsed: number | null
  business_days_remaining: number | null
  is_breached: boolean
  color: SLAColor
}

export interface EnvelopeListItem {
  id: string
  folio: string
  company_name: string
  requested_by_name: string
  contract_type_name: string
  assigned_lawyer_name: string | null
  status: EnvelopeStatus
  is_open_request: boolean
  submitted_at: string | null
  sla_due_at: string | null
  is_sla_breached: boolean
  sla_color: SLAColor
  created_at: string
}

// Alias para compatibilidad
export type ContractRequestListItem = EnvelopeListItem

export interface EnvelopeOut {
  id: string
  folio: string
  company_id: string
  company_name: string
  requested_by_user_id: string
  requested_by_name: string
  requested_by_email: string
  contract_type_id: string
  contract_type_name: string
  assigned_lawyer_id: string | null
  assigned_lawyer_name: string | null
  assigned_lawyer_email: string | null
  assigned_at: string | null
  status: EnvelopeStatus
  form_data: Record<string, any> | null
  counterparty_name: string | null
  counterparty_email: string | null
  is_open_request: boolean
  open_request_description: string | null
  submitted_at: string | null
  sla_due_at: string | null
  sla_closed_at: string | null
  is_sla_breached: boolean
  sla: SLAInfo | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

// Alias para compatibilidad
export type ContractRequestOut = EnvelopeOut

export interface PaginatedEnvelopes {
  data: EnvelopeListItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

// Alias para compatibilidad
export type PaginatedContractRequests = PaginatedEnvelopes

export interface ContractType {
  id: string
  name: string
  slug: string
  description: string | null
  sla_business_days: number
  is_active: boolean
}

export interface SLAReport {
  generated_at: string
  overdue_count: number
  on_time_count: number
  in_signatures_count: number
  overdue_items: SLAReportItem[]
  in_signatures_items: EnvelopeListItem[]
}

export interface SLAReportItem {
  folio: string
  company_name: string
  requested_by_name: string
  contract_type_name: string
  assigned_lawyer_name: string | null
  status: EnvelopeStatus
  submitted_at: string | null
  sla_due_at: string | null
  days_overdue: number
  side: 'legal' | 'cliente'
}

export interface CreateEnvelopePayload {
  contract_type_id: string
  form_data?: Record<string, any>
  counterparty_name?: string
  counterparty_email?: string
  is_open_request?: boolean
  open_request_description?: string
}

// Alias para compatibilidad
export type CreateContractRequestPayload = CreateEnvelopePayload

export interface EnvelopeStatusLog {
  id: string
  from_status: string | null
  to_status: string
  changed_by_name: string
  changed_by_role: string
  reason: string | null
  changed_at: string
}

// Alias para compatibilidad
export type ContractStatusLog = EnvelopeStatusLog

export interface EnvelopeComment {
  id: string
  author_name: string
  author_role: string
  body: string
  is_internal: boolean
  created_at: string
  edited_at: string | null
}

// Alias para compatibilidad
export type ContractComment = EnvelopeComment

export interface EnvelopeAttachment {
  id: string
  original_name: string
  mime_type: string
  extension: string
  size_bytes: number
  description: string | null
  uploaded_by_name: string
  uploaded_at: string
  download_url: string | null
}

// Alias para compatibilidad
export type ContractAttachment = EnvelopeAttachment

export type LegalRole =
  | 'solicitante'
  | 'abogado'
  | 'coordinador_legal'
  | 'director'
  | 'super_admin'

export const resolveLegalRole = (roles: string[]): LegalRole => {
  if (roles.includes('super_admin')) return 'super_admin'
  if (roles.includes('coordinador_legal')) return 'coordinador_legal'
  if (roles.includes('director')) return 'director'
  if (roles.includes('abogado')) return 'abogado'
  return 'solicitante'
}
