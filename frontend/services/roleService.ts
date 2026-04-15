import api from '@/services/api'
import {
  CreateGlobalRolePayload,
  UpdateGlobalRolePayload,
  CreateOperationalRolePayload,
  UpdateOperationalRolePayload,
  CreateGlobalPermissionPayload,
  CreateSubmodulePermissionPayload,
} from '@/types/role.types'

// ── Roles globales ────────────────────────────────────────────────────────────

export const getGlobalRoles = (params?: Record<string, string | number>) =>
  api.get('/api/v1/roles/global', { params })

export const createGlobalRole = (data: CreateGlobalRolePayload) =>
  api.post('/api/v1/roles/global', data)

export const updateGlobalRole = (roleId: string, data: UpdateGlobalRolePayload) =>
  api.patch(`/api/v1/roles/global/${roleId}`, data)

export const deleteGlobalRole = (roleId: string) =>
  api.delete(`/api/v1/roles/global/${roleId}`)

export const assignPermissionToGlobalRole = (roleId: string, permissionId: string) =>
  api.post(`/api/v1/roles/global/${roleId}/permissions`, { permission_id: permissionId })

export const removePermissionFromGlobalRole = (roleId: string, permissionId: string) =>
  api.delete(`/api/v1/roles/global/${roleId}/permissions/${permissionId}`)

// ── Roles operativos ──────────────────────────────────────────────────────────

export const getOperationalRoles = (params?: Record<string, string | number>) =>
  api.get('/api/v1/roles/operational', { params })

export const createOperationalRole = (data: CreateOperationalRolePayload) =>
  api.post('/api/v1/roles/operational', data)

export const updateOperationalRole = (roleId: string, data: UpdateOperationalRolePayload) =>
  api.patch(`/api/v1/roles/operational/${roleId}`, data)

export const deleteOperationalRole = (roleId: string) =>
  api.delete(`/api/v1/roles/operational/${roleId}`)

export const assignPermissionToOperationalRole = (roleId: string, permissionId: string) =>
  api.post(`/api/v1/roles/operational/${roleId}/permissions`, { permission_id: permissionId })

export const removePermissionFromOperationalRole = (roleId: string, permissionId: string) =>
  api.delete(`/api/v1/roles/operational/${roleId}/permissions/${permissionId}`)

// ── Permisos globales ─────────────────────────────────────────────────────────

export const getGlobalPermissions = (params?: Record<string, string | number>) =>
  api.get('/api/v1/permissions/global', { params })

export const createGlobalPermission = (data: CreateGlobalPermissionPayload) =>
  api.post('/api/v1/permissions/global', data)

export const updateGlobalPermission = (permissionId: string, data: Partial<CreateGlobalPermissionPayload>) =>
  api.patch(`/api/v1/permissions/global/${permissionId}`, data)

export const deleteGlobalPermission = (permissionId: string) =>
  api.delete(`/api/v1/permissions/global/${permissionId}`)

// ── Permisos de submódulo ─────────────────────────────────────────────────────

export const getSubmodulePermissions = (submoduleId: string) =>
  api.get(`/api/v1/permissions/submodules/${submoduleId}`)

export const createSubmodulePermission = (submoduleId: string, data: CreateSubmodulePermissionPayload) =>
  api.post(`/api/v1/permissions/submodules/${submoduleId}`, data)

export const updateSubmodulePermission = (submoduleId: string, permissionId: string, data: Partial<CreateSubmodulePermissionPayload>) =>
  api.patch(`/api/v1/permissions/submodules/${submoduleId}/${permissionId}`, data)

export const deleteSubmodulePermission = (submoduleId: string, permissionId: string) =>
  api.delete(`/api/v1/permissions/submodules/${submoduleId}/${permissionId}`)

// ── Árbol de permisos de un módulo ────────────────────────────────────────────

export const getModulePermissionsTree = (moduleId: string) =>
  api.get(`/api/v1/permissions/modules/${moduleId}/tree`)
