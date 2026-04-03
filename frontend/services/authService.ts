import api from '@/services/api'
import {
  LoginRequest,
  LoginResponse,
  TwoFARequest,
  TwoFASetupResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  PasswordResetRequest,
  PasswordResetConfirmRequest,
  AuthUser,
  UserSession,
  TokenPair,
} from '@/types/auth.types'
import { ApiResponse } from '@/types/api.types'

// ── Login ─────────────────────────────────────────────────────────────────────

export const login = async (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
  const res = await api.post('/api/v1/auth/login', data)
  return res.data
}

// ── 2FA ───────────────────────────────────────────────────────────────────────

export const verify2FA = async (data: TwoFARequest): Promise<ApiResponse<TokenPair>> => {
  const res = await api.post('/api/v1/auth/2fa/verify', data)
  return res.data
}

export const get2FASetup = async (): Promise<ApiResponse<TwoFASetupResponse>> => {
  const res = await api.get('/api/v1/2fa/setup')
  return res.data
}

export const activate2FA = async (code: string): Promise<ApiResponse<null>> => {
  const res = await api.post('/api/v1/2fa/activate', { code })
  return res.data
}

// ── Cambio de contraseña ──────────────────────────────────────────────────────

export const changePassword = async (
  data: ChangePasswordRequest
): Promise<ApiResponse<ChangePasswordResponse>> => {
  const res = await api.post('/api/v1/auth/change-temp-password', data)
  return res.data
}

// ── Recuperación de contraseña ────────────────────────────────────────────────

export const requestPasswordReset = async (
  data: PasswordResetRequest
) => {
  const res = await api.post('/api/v1/auth/password-reset/request', data)
  return res
}

export const confirmPasswordReset = async (
  data: PasswordResetConfirmRequest
): Promise<ApiResponse<null>> => {
  const res = await api.post('/api/v1/auth/password-reset/confirm', data)
  return res.data
}

// ── Sesión ────────────────────────────────────────────────────────────────────

export const getMe = async (): Promise<ApiResponse<AuthUser>> => {
  const res = await api.get('/api/v1/auth/me')
  return res.data
}

export const logout = async (refreshToken: string): Promise<void> => {
  await api.post('/api/v1/auth/logout', { refresh_token: refreshToken })
}

export const getSessions = async (): Promise<ApiResponse<UserSession[]>> => {
  const res = await api.get('/api/v1/auth/sessions')
  return res.data
}

export const revokeSession = async (sessionId: string): Promise<void> => {
  await api.post('/api/v1/auth/sessions/revoke', { session_id: sessionId })
}