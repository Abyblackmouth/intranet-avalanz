import api from '@/services/api'
import { CreateUserPayload, UpdateUserPayload, ModuleAccessPayload } from '@/types/user.types'

// ── Usuarios ──────────────────────────────────────────────────────────────────

export const getUsers = (params?: Record<string, string | number | boolean>) =>
  api.get('/api/v1/users/', { params })

export const getUser = (userId: string) =>
  api.get(`/api/v1/users/${userId}`)

export const createUser = (data: CreateUserPayload) =>
  api.post('/api/v1/users/', data)

export const updateUser = (userId: string, data: UpdateUserPayload) =>
  api.patch(`/api/v1/users/${userId}`, data)

export const deleteUser = (userId: string) =>
  api.delete(`/api/v1/users/${userId}`)

export const toggleLockUser = (userId: string, lock: boolean, reason: string) =>
  api.post(`/api/v1/users/${userId}/lock`, { lock, reason })

export const assignGlobalRole = (userId: string, roleId: string) =>
  api.post(`/api/v1/users/${userId}/global-roles`, { role_id: roleId })

export const assignModuleAccess = (userId: string, data: ModuleAccessPayload) =>
  api.post(`/api/v1/users/${userId}/module-access`, data)

export const revokeModuleAccess = (userId: string, moduleId: string) =>
  api.delete(`/api/v1/users/${userId}/module-access`, { data: { module_id: moduleId } })

export const getUserPermissions = (userId: string) =>
  api.get(`/api/v1/users/${userId}/permissions`)

export const getUserSessions = (userId: string) =>
  api.get(`/api/v1/users/${userId}/sessions`)

export const getUserLoginHistory = (userId: string) =>
  api.get(`/api/v1/users/${userId}/login-history`)

export const revokeAllSessions = (userId: string) =>
  api.post(`/api/v1/auth/sessions/revoke-all`, { user_id: userId })

export const resetUserPassword = (userId: string, newPassword: string) =>
  api.post(`/api/v1/users/${userId}/reset-password`, { new_password: newPassword })

// ── Grupos ────────────────────────────────────────────────────────────────────

export const getGroups = (params?: Record<string, string | number | boolean>) =>
  api.get('/api/v1/groups/', { params })

export const enableGroup = (groupId: string) =>
  api.patch(`/api/v1/groups/${groupId}/enable`)

export const disableGroup = (groupId: string) =>
  api.patch(`/api/v1/groups/${groupId}/disable`)

// ── Empresas ──────────────────────────────────────────────────────────────────

export const getCompanies = (params?: Record<string, string | number | boolean>) =>
  api.get('/api/v1/companies/', { params })

export const createCompany = (data: Record<string, any>) =>
  api.post('/api/v1/companies/', data)

export const updateCompany = (companyId: string, data: Record<string, any>) =>
  api.patch(`/api/v1/companies/${companyId}`, data)

export const enableCompany = (companyId: string) =>
  api.patch(`/api/v1/companies/${companyId}/enable`)

export const disableCompany = (companyId: string) =>
  api.patch(`/api/v1/companies/${companyId}/disable`)

// ── Roles globales ────────────────────────────────────────────────────────────

export const getGlobalRoles = () =>
  api.get('/api/v1/roles/global')

export const removeGlobalRole = (userId: string, roleId: string) =>
  api.delete(`/api/v1/users/${userId}/global-roles`, { data: { role_id: roleId } })

// ── Modulos ───────────────────────────────────────────────────────────────────

export const getModules = () =>
  api.get('/api/v1/modules/')

export const getModuleRoles = (moduleId: string) =>
  api.get(`/api/v1/roles/modules/${moduleId}`)
