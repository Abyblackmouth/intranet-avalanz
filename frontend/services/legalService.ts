import api from '@/services/api'
import { CreateEnvelopePayload } from '@/types/contract.types'

const BASE = '/api/v1/legal/envelopes'

// ── Tipos de contrato ─────────────────────────────────────────────────────────
export const getContractTypes = (activeOnly = true) =>
  api.get(`${BASE}/types`, { params: { active_only: activeOnly } })

export const getContractType = (id: string) =>
  api.get(`${BASE}/types/${id}`)

export const createContractType = (data: Record<string, any>) =>
  api.post(`${BASE}/types`, data)

export const updateContractType = (id: string, data: Record<string, any>) =>
  api.patch(`${BASE}/types/${id}`, data)

// ── Asignación de abogados ────────────────────────────────────────────────────
export const assignLawyerToType = (contractTypeId: string, data: Record<string, any>) =>
  api.post(`${BASE}/types/${contractTypeId}/lawyers`, data)

export const deactivateLawyerAssignment = (assignmentId: string) =>
  api.delete(`${BASE}/lawyers/assignments/${assignmentId}`)

// ── Sobres ────────────────────────────────────────────────────────────────────
export const getEnvelopes = (params?: Record<string, string | number | boolean>) =>
  api.get(BASE, { params })

export const getEnvelope = (id: string) =>
  api.get(`${BASE}/${id}`)

export const createEnvelope = (data: CreateEnvelopePayload) =>
  api.post(BASE, data)

export const updateEnvelope = (id: string, data: Record<string, any>) =>
  api.patch(`${BASE}/${id}`, data)

// ── Transiciones de estado ────────────────────────────────────────────────────
export const submitEnvelope = (id: string, data?: Record<string, any>) =>
  api.post(`${BASE}/${id}/submit`, data || {})

export const approveEnvelope = (id: string) =>
  api.post(`${BASE}/${id}/approve`)

export const requestCorrections = (id: string, reason: string) =>
  api.post(`${BASE}/${id}/request-corrections`, { reason })

export const rejectEnvelope = (id: string, reason: string) =>
  api.post(`${BASE}/${id}/reject`, { reason })

export const completeEnvelope = (id: string) =>
  api.post(`${BASE}/${id}/complete`)

export const reassignLawyer = (id: string, data: Record<string, any>) =>
  api.post(`${BASE}/${id}/reassign`, data)

// ── Comentarios ───────────────────────────────────────────────────────────────
export const getEnvelopeComments = (id: string) =>
  api.get(`${BASE}/${id}/comments`)

export const addEnvelopeComment = (id: string, body: string, isInternal: boolean) =>
  api.post(`${BASE}/${id}/comments`, { body, is_internal: isInternal })

// ── Trazabilidad ──────────────────────────────────────────────────────────────
export const getEnvelopeStatusLog = (id: string) =>
  api.get(`${BASE}/${id}/status-log`)

export const getEnvelopeTimeTracking = (id: string) =>
  api.get(`${BASE}/${id}/time-tracking`)

export const getEnvelopeActivityLog = (id: string) =>
  api.get(`${BASE}/${id}/activity-log`)

export const getEnvelopeFormSnapshots = (id: string) =>
  api.get(`${BASE}/${id}/form-snapshots`)

// ── Reporte SLA ───────────────────────────────────────────────────────────────
export const getSLAReport = () =>
  api.get(`${BASE}/reports/sla`)

// ── Aliases para compatibilidad (deprecated — usar nombres nuevos) ─────────────
export const getContractRequests  = getEnvelopes
export const getContractRequest   = getEnvelope
export const createContractRequest = createEnvelope
export const approveContractRequest = approveEnvelope
export const rejectContractRequest  = rejectEnvelope
export const completeContractRequest = completeEnvelope
export const getContractComments  = getEnvelopeComments
export const addContractComment   = addEnvelopeComment
export const getContractStatusLog = getEnvelopeStatusLog
export const getContractTimeTracking = getEnvelopeTimeTracking
export const getContractActivityLog  = getEnvelopeActivityLog
export const getContractFormSnapshots = getEnvelopeFormSnapshots
