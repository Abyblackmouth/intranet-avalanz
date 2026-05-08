import api from '@/services/api'
import { CreateContractRequestPayload } from '@/types/contract.types'

// ── Tipos de contrato ─────────────────────────────────────────────────────────
export const getContractTypes = (activeOnly = true) =>
  api.get('/api/v1/legal/contract-requests/types', { params: { active_only: activeOnly } })

export const getContractType = (id: string) =>
  api.get(`/api/v1/legal/contract-requests/types/${id}`)

export const createContractType = (data: Record<string, any>) =>
  api.post('/api/v1/legal/contract-requests/types', data)

export const updateContractType = (id: string, data: Record<string, any>) =>
  api.patch(`/api/v1/legal/contract-requests/types/${id}`, data)

// ── Asignación de abogados ────────────────────────────────────────────────────
export const assignLawyerToType = (contractTypeId: string, data: Record<string, any>) =>
  api.post(`/api/v1/legal/contract-requests/types/${contractTypeId}/lawyers`, data)

export const deactivateLawyerAssignment = (assignmentId: string) =>
  api.delete(`/api/v1/legal/contract-requests/lawyers/assignments/${assignmentId}`)

// ── Solicitudes de contrato ───────────────────────────────────────────────────
export const getContractRequests = (params?: Record<string, string | number | boolean>) =>
  api.get('/api/v1/legal/contract-requests', { params })

export const getContractRequest = (id: string) =>
  api.get(`/api/v1/legal/contract-requests/${id}`)

export const createContractRequest = (data: CreateContractRequestPayload) =>
  api.post('/api/v1/legal/contract-requests', data)

export const updateContractRequest = (id: string, data: Record<string, any>) =>
  api.patch(`/api/v1/legal/contract-requests/${id}`, data)

// ── Transiciones de estado ────────────────────────────────────────────────────
export const submitContractRequest = (id: string, data?: Record<string, any>) =>
  api.post(`/api/v1/legal/contract-requests/${id}/submit`, data || {})

export const approveContractRequest = (id: string) =>
  api.post(`/api/v1/legal/contract-requests/${id}/approve`)

export const requestCorrections = (id: string, reason: string) =>
  api.post(`/api/v1/legal/contract-requests/${id}/request-corrections`, { reason })

export const rejectContractRequest = (id: string, reason: string) =>
  api.post(`/api/v1/legal/contract-requests/${id}/reject`, { reason })

export const completeContractRequest = (id: string) =>
  api.post(`/api/v1/legal/contract-requests/${id}/complete`)

export const reassignLawyer = (id: string, data: Record<string, any>) =>
  api.post(`/api/v1/legal/contract-requests/${id}/reassign`, data)

// ── Comentarios ───────────────────────────────────────────────────────────────
export const getContractComments = (id: string) =>
  api.get(`/api/v1/legal/contract-requests/${id}/comments`)

export const addContractComment = (id: string, body: string, isInternal: boolean) =>
  api.post(`/api/v1/legal/contract-requests/${id}/comments`, { body, is_internal: isInternal })

// ── Trazabilidad ──────────────────────────────────────────────────────────────
export const getContractStatusLog = (id: string) =>
  api.get(`/api/v1/legal/contract-requests/${id}/status-log`)

export const getContractTimeTracking = (id: string) =>
  api.get(`/api/v1/legal/contract-requests/${id}/time-tracking`)

export const getContractActivityLog = (id: string) =>
  api.get(`/api/v1/legal/contract-requests/${id}/activity-log`)

export const getContractFormSnapshots = (id: string) =>
  api.get(`/api/v1/legal/contract-requests/${id}/form-snapshots`)

// ── Reporte SLA ───────────────────────────────────────────────────────────────
export const getSLAReport = () =>
  api.get('/api/v1/legal/contract-requests/reports/sla')
