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
  api.get(`/api/v1/auth/internal/users/${userId}/sessions`)

export const getUserLoginHistory = (userId: string) =>
  api.get(`/api/v1/auth/internal/users/${userId}/login-history`)

export const revokeAllSessions = (userId: string, revokedByName: string, revokedByEmail: string) =>
  api.post(`/api/v1/auth/internal/users/${userId}/revoke-sessions`, { revoked_by_name: revokedByName, revoked_by_email: revokedByEmail })

export const resetUserPassword = (userId: string, newPassword: string) =>
  api.post(`/api/v1/users/${userId}/reset-password`, { new_password: newPassword })

// ── Grupos ────────────────────────────────────────────────────────────────────

export const getGroups = (params?: Record<string, string | number | boolean>) =>
  api.get('/api/v1/groups/', { params })

export const createGroup = (data: Record<string, any>) =>
  api.post('/api/v1/groups/', data)

export const updateGroup = (groupId: string, data: Record<string, any>) =>
  api.patch(`/api/v1/groups/${groupId}`, data)

export const deleteGroup = (groupId: string) =>
  api.delete(`/api/v1/groups/${groupId}`)

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

export const deleteCompany = (companyId: string) =>
  api.delete(`/api/v1/companies/${companyId}`)

export const enableCompany = (companyId: string) =>
  api.patch(`/api/v1/companies/${companyId}/enable`)

export const disableCompany = (companyId: string) =>
  api.patch(`/api/v1/companies/${companyId}/disable`)

// ── Modulos ──────────────────────────────────────────────────────────────────

export const getModule = (moduleId: string) =>
  api.get(`/api/v1/modules/${moduleId}`)

export const createModule = (data: Record<string, any>) =>
  api.post('/api/v1/modules/', data)

export const updateModule = (moduleId: string, data: Record<string, any>) =>
  api.patch(`/api/v1/modules/${moduleId}`, data)

export const deleteModule = (moduleId: string) =>
  api.delete(`/api/v1/modules/${moduleId}`)

export const createSubmodule = (moduleId: string, data: Record<string, any>) =>
  api.post(`/api/v1/modules/${moduleId}/submodules`, data)

export const updateSubmodule = (moduleId: string, submoduleId: string, data: Record<string, any>) =>
  api.patch(`/api/v1/modules/${moduleId}/submodules/${submoduleId}`, data)

export const deleteSubmodule = (moduleId: string, submoduleId: string) =>
  api.delete(`/api/v1/modules/${moduleId}/submodules/${submoduleId}`)

// ── Roles globales ────────────────────────────────────────────────────────────

export const getGlobalRoles = () =>
  api.get('/api/v1/roles/global')

export const removeGlobalRole = (userId: string, roleId: string) =>
  api.delete(`/api/v1/users/${userId}/global-roles`, { data: { role_id: roleId } })

// ── Modulos ───────────────────────────────────────────────────────────────────

export const getModules = (params?: Record<string, string | number | boolean>) =>
  api.get('/api/v1/modules/', { params })

export const getModuleRoles = (moduleId: string) =>
  api.get(`/api/v1/roles/modules/${moduleId}`)
