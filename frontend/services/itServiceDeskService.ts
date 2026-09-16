import api from './api'

const BASE = '/api/v1/it-service-desk/actualizaciones'

// ── Sistemas ──────────────────────────────────────────────────────────────
export const getSystems = () => api.get(`${BASE}/sistemas`)
export const createSystem = (data: { name: string; is_active?: boolean }) =>
  api.post(`${BASE}/sistemas`, data)
export const updateSystem = (id: string, data: { name: string; is_active?: boolean }) =>
  api.patch(`${BASE}/sistemas/${id}`, data)

// ── Módulos ───────────────────────────────────────────────────────────────
export const getModulesCatalog = (systemId?: string) =>
  api.get(`${BASE}/modulos`, { params: systemId ? { system_id: systemId } : {} })
export const createModuleCatalog = (data: { system_id: string; name: string; is_active?: boolean }) =>
  api.post(`${BASE}/modulos`, data)
export const updateModuleCatalog = (id: string, data: { system_id: string; name: string; is_active?: boolean }) =>
  api.patch(`${BASE}/modulos/${id}`, data)

// ── Especialistas ─────────────────────────────────────────────────────────
export const getSpecialists = () => api.get(`${BASE}/especialistas`)
export const createSpecialist = (data: {
  system_id?: string | null
  module_id?: string | null
  team_type: string
  specialist_user_id: string
  is_active?: boolean
}) => api.post(`${BASE}/especialistas`, data)
export const updateSpecialist = (id: string, data: {
  system_id?: string | null
  module_id?: string | null
  team_type: string
  specialist_user_id: string
  is_active?: boolean
}) => api.patch(`${BASE}/especialistas/${id}`, data)

// ── Usuarios por rol (para el desplegable de "asignar tecnico") ───────────
export const getUsersByRole = (roleSlug: string) =>
  api.get(`/api/v1/it-service-desk/actualizaciones/usuarios-por-rol`, { params: { role_slug: roleSlug } })
