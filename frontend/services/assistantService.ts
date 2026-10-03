// ----------------------------------------------------------------------
// Servicio del Asistente Avalanz
// Disponibilidad por modulo y busqueda. Usa el cliente Axios comun, que
// agrega el token y lo renueva automaticamente.
// ----------------------------------------------------------------------
import api from '@/services/api'

export type AssistantConfidence = 'alta' | 'media' | 'baja'

export interface AssistantResult {
  title: string
  document: string
  module: string
  kind: 'text' | 'table' | 'speech'
  location: string
  page: number | null
  slide: number | null
  start_seconds: number | null
  context: string
  text: string
  score: number
}

export interface AssistantSearchResponse {
  type?: 'conversacion' | 'busqueda'
  reply?: string | null
  show_ticket?: boolean
  action?: string | null
  intent?: string | null
  confidence: AssistantConfidence | 'conversacion'
  overlap: number
  results: AssistantResult[]
}

// Si el asistente esta activo para el usuario en el modulo
export const getAssistantAvailability = async (module: string): Promise<boolean> => {
  const { data } = await api.get<{ available: boolean }>('/api/v1/assistant/availability', { params: { module } })
  return Boolean(data?.available)
}

// Busqueda hibrida en el conocimiento del modulo
export const searchAssistant = async (question: string, module: string): Promise<AssistantSearchResponse> => {
  const { data } = await api.post<AssistantSearchResponse>('/api/v1/assistant/search', { question, module })
  return data
}

// Mensaje del usuario al dialog-service: responde platica basica o
// consulta el conocimiento (assistant-service) con el mismo formato
export const sendDialogMessage = async (message: string, module: string): Promise<AssistantSearchResponse> => {
  const { data } = await api.post<AssistantSearchResponse>('/api/v1/dialog/message', { message, module })
  return data
}

// ----------------------------------------------------------------------
// Ticket desde el chat (dialog-service)
// ----------------------------------------------------------------------
export interface TicketCatalogs {
  systems: { id: string; name: string; modules: { id: string; name: string }[] }[]
  severities: { id: string; code: string; name: string }[]
}

export interface ChatTicketFields {
  title: string
  description: string
  system_id: string
  module_id: string | null
  reported_type: 'funcional' | 'tecnico'
  severity_reported_id: string
}

export const getTicketCatalogs = async (): Promise<TicketCatalogs> => {
  const { data } = await api.get<TicketCatalogs>('/api/v1/dialog/ticket/catalogs')
  return data
}

export const suggestTicketType = async (text: string, topics: string[] = []): Promise<{ reported_type: 'funcional' | 'tecnico'; keywords: string[]; system?: string | null }> => {
  const { data } = await api.post('/api/v1/dialog/ticket/suggest', { text, topics })
  return data
}

export const createChatTicket = async (fields: ChatTicketFields, files: File[]): Promise<{ id: string; folio: string; status: string }> => {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => { if (value) form.append(key, value) })
  files.forEach((file) => form.append('files', file))
  const { data } = await api.post('/api/v1/dialog/ticket', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data
}
