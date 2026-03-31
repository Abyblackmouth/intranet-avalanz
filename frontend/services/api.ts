// ── Login ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  action?: 'change_password' | '2fa_required' | null
  user_id?: string
  temp_token?: string
  access_token?: string
  refresh_token?: string
  token_type?: string
  requires_2fa?: boolean
}

// ── 2FA ───────────────────────────────────────────────────────────────────────

export interface TwoFARequest {
  temp_token: string
  code: string
}

export interface TwoFASetupResponse {
  qr_code_svg: string
  secret: string
  backup_codes: string[]
  issuer: string
  account: string
}

// ── Cambio de contraseña ──────────────────────────────────────────────────────

export interface ChangePasswordRequest {
  user_id: string
  new_password: string
}

export interface ChangePasswordResponse {
  action: 'setup_2fa'
  user_id: string
}

// ── Recuperación de contraseña ────────────────────────────────────────────────

export interface PasswordResetRequest {
  email: string
}

export interface PasswordResetConfirmRequest {
  token: string
  new_password: string
}

// ── Usuario autenticado ───────────────────────────────────────────────────────

export interface AuthUser {
  user_id: string
  email: string
  full_name: string
  roles: string[]
  modules: string[]
  companies: string[]
  permissions: string[]
  session_started_at: string
  absolute_exp: string
  exp: number
}

// ── Sesiones ──────────────────────────────────────────────────────────────────

export interface UserSession {
  session_id: string
  ip_address: string
  user_agent: string
  is_corporate_network: boolean
  session_started_at: string
  last_activity_at: string
  expires_at: string
}

// ── Tokens ────────────────────────────────────────────────────────────────────

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}