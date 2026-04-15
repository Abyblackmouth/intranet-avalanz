// ── Rol global (super_admin, admin_empresa) ───────────────────────────────────
export interface GlobalRoleRow {
  role_id: string
  name: string
  slug: string
  description: string | null
  is_active: boolean
  created_at: string
}

// ── Rol operativo (Gerente, Supervisor, Operador, etc.) ───────────────────────
export interface OperationalRoleRow {
  role_id: string
  module_id: string | null
  name: string
  slug: string
  description: string | null
  scope: 'empresa' | 'corporativo'
  is_active: boolean
  created_at: string
}

// ── Permiso global ────────────────────────────────────────────────────────────
export interface GlobalPermissionRow {
  permission_id: string
  name: string
  slug: string
  description: string | null
  category: string | null
  created_at: string
}

// ── Permiso de submódulo ──────────────────────────────────────────────────────
export interface SubmodulePermissionRow {
  permission_id: string
  submodule_id: string
  name: string
  slug: string
  description: string | null
}

// ── Árbol de permisos de un módulo ────────────────────────────────────────────
export interface PermissionTreeSubmodule {
  submodule_id: string
  submodule_name: string
  submodule_slug: string
  permissions: SubmodulePermissionRow[]
}

export interface PermissionTree {
  module_id: string
  module_name: string
  module_slug: string
  submodules: PermissionTreeSubmodule[]
}

// ── Payloads ──────────────────────────────────────────────────────────────────
export interface CreateGlobalRolePayload {
  name: string
  description?: string
}

export interface UpdateGlobalRolePayload {
  name?: string
  description?: string
  is_active?: boolean
}

export interface CreateOperationalRolePayload {
  name: string
  description?: string
  scope: 'empresa' | 'corporativo'
  module_id?: string
}

export interface UpdateOperationalRolePayload {
  name?: string
  description?: string
  scope?: 'empresa' | 'corporativo'
  is_active?: boolean
}

export interface CreateGlobalPermissionPayload {
  name: string
  description?: string
  category?: string
}

export interface CreateSubmodulePermissionPayload {
  name: string
  description?: string
}
