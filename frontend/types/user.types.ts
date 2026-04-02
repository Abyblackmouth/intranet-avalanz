// ── Usuario en tabla ──────────────────────────────────────────────────────────

export interface UserRow {
  user_id: string
  email: string
  full_name: string
  matricula: string | null
  puesto: string | null
  departamento: string | null
  company_id: string
  company_name: string
  roles: string[]
  is_active: boolean
  is_locked: boolean
  is_2fa_configured: boolean
  is_super_admin: boolean
  last_login_at: string | null
  created_at: string
}

// ── Crear usuario ─────────────────────────────────────────────────────────────

export interface CreateUserPayload {
  company_id: string
  email: string
  full_name: string
  matricula?: string
  puesto?: string
  departamento?: string
  is_super_admin?: boolean
  global_role_id?: string
  module_accesses?: ModuleAccessPayload[]
}

// ── Actualizar usuario ────────────────────────────────────────────────────────

export interface UpdateUserPayload {
  full_name?: string
  matricula?: string
  puesto?: string
  departamento?: string
  is_active?: boolean
}

// ── Acceso a modulo ───────────────────────────────────────────────────────────

export interface ModuleAccessPayload {
  module_id: string
  role_id: string
}

// ── Respuesta de creacion ─────────────────────────────────────────────────────

export interface CreateUserResponse {
  user_id: string
  email: string
  full_name: string
  matricula: string | null
  puesto: string | null
  departamento: string | null
  temp_password: string
  temp_password_expires_at: string
  message: string
}