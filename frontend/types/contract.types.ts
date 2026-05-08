export type ContractStatus =
  | 'borrador'
  | 'pendiente_legal'
  | 'pendiente_cliente'
  | 'en_revision_legal'
  | 'en_firmas'
  | 'firmado_parcial'
  | 'completado'
  | 'rechazado'

export type SLAColor = 'green' | 'yellow' | 'red'

export interface SLAInfo {
  submitted_at: string | null
  sla_due_at: string | null
  business_days_elapsed: number | null
  business_days_remaining: number | null
  is_breached: boolean
  color: SLAColor
}

export interface ContractRequestListItem {
  id: string
  folio: string
  company_name: string
  requested_by_name: string
  contract_type_name: string
  assigned_lawyer_name: string | null
  status: ContractStatus
  is_open_request: boolean
  submitted_at: string | null
  sla_due_at: string | null
  is_sla_breached: boolean
  sla_color: SLAColor
  created_at: string
}

export interface ContractRequestOut {
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
  status: ContractStatus
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

export interface PaginatedContractRequests {
  data: ContractRequestListItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

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
  in_signatures_items: ContractRequestListItem[]
}

export interface SLAReportItem {
  folio: string
  company_name: string
  requested_by_name: string
  contract_type_name: string
  assigned_lawyer_name: string | null
  status: ContractStatus
  submitted_at: string | null
  sla_due_at: string | null
  days_overdue: number
  side: 'legal' | 'cliente'
}

export interface CreateContractRequestPayload {
  contract_type_id: string
  form_data?: Record<string, any>
  counterparty_name?: string
  counterparty_email?: string
  is_open_request?: boolean
  open_request_description?: string
}

export interface ContractStatusLog {
  id: string
  from_status: string | null
  to_status: string
  changed_by_name: string
  changed_by_role: string
  reason: string | null
  changed_at: string
}

export interface ContractComment {
  id: string
  author_name: string
  author_role: string
  body: string
  is_internal: boolean
  created_at: string
  edited_at: string | null
}

export interface ContractAttachment {
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
