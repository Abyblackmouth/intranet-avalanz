export interface SubmoduleRow {
  submodule_id: string
  module_id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  is_active: boolean
  created_at: string
}

export interface ModuleRow {
  module_id: string
  company_id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  is_active: boolean
  created_at: string
  submodules?: SubmoduleRow[]
}
