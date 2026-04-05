export interface GroupRow {
  group_id: string
  name: string
  slug: string
  description: string | null
  is_active: boolean
  created_at: string
  companies?: CompanyRow[]
}

export interface CompanyRow {
  company_id: string
  group_id: string
  nombre_comercial: string
  name: string
  slug: string
  rfc: string | null
  description: string | null
  is_active: boolean
  created_at: string
}
