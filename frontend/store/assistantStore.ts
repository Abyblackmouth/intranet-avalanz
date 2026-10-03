// ----------------------------------------------------------------------
// Estado del chat del asistente
// Persiste la conversacion para que abrir y cerrar el panel, o recargar
// la pagina, no la pierda. Se reinicia al cambiar de sesion (nuevo
// inicio de sesion), al reiniciar el chat o al cerrar sesion.
// El borrador del ticket vive solo en memoria: sus imagenes no se pueden
// guardar en el navegador, asi que se descarta al recargar.
// ----------------------------------------------------------------------
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AssistantConfidence, AssistantResult } from '@/services/assistantService'

// Maximo de mensajes que se conservan
const MAX_MESSAGES = 50

// Pasos del ticket desde el chat
export type TicketStep = 'describe' | 'type' | 'system' | 'module' | 'severity' | 'attach' | 'review' | 'sending'

export interface TicketDraft {
  step: TicketStep
  title: string
  description: string
  suggestedType: 'funcional' | 'tecnico' | null
  reportedType: 'funcional' | 'tecnico' | null
  systemId: string | null
  moduleId: string | null
  severityId: string | null
  files: File[]
  error: string | null
}

// Ticket creado desde el chat y su asignacion en vivo
export interface TicketInfo {
  id: string
  folio: string
  assignState: 'pending' | 'assigned' | 'done'
  assignedTo?: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  results?: AssistantResult[]
  confidence?: AssistantConfidence
  showTicket?: boolean
  module?: string
  ticket?: TicketInfo
  createdAt: number
}

interface AssistantState {
  sessionKey: string
  greeted: boolean
  isOpen: boolean
  messages: ChatMessage[]
  ticketDraft: TicketDraft | null
  syncSession: (key: string) => void
  setOpen: (open: boolean) => void
  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'>) => void
  markGreeted: () => void
  resetChat: () => void
  clearAll: () => void
  setTicketDraft: (draft: TicketDraft | null) => void
  patchTicketDraft: (patch: Partial<TicketDraft>) => void
  updateTicket: (ticketId: string, patch: Partial<TicketInfo>) => void
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => ({
      sessionKey: '',
      greeted: false,
      isOpen: false,
      messages: [],
      ticketDraft: null,

      // Sesion nueva: conversacion nueva y saludo nuevo
      syncSession: (key) => {
        if (key && key !== get().sessionKey) {
          set({ sessionKey: key, greeted: false, isOpen: false, messages: [], ticketDraft: null })
        }
      },
      setOpen: (open) => set({ isOpen: open }),
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, { ...message, id: newId(), createdAt: Date.now() }].slice(-MAX_MESSAGES),
        })),
      markGreeted: () => set({ greeted: true }),
      // Reiniciar conserva el saludo como ya hecho en esta sesion
      resetChat: () => set({ messages: [], ticketDraft: null }),
      clearAll: () => set({ sessionKey: '', greeted: false, isOpen: false, messages: [], ticketDraft: null }),

      setTicketDraft: (draft) => set({ ticketDraft: draft }),
      patchTicketDraft: (patch) =>
        set((state) => (state.ticketDraft ? { ticketDraft: { ...state.ticketDraft, ...patch } } : {})),
      // Solo cambia tickets que siguen esperando su asignacion
      updateTicket: (ticketId, patch) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.ticket && m.ticket.id === ticketId && m.ticket.assignState === 'pending'
              ? { ...m, ticket: { ...m.ticket, ...patch } }
              : m
          ),
        })),
    }),
    {
      name: 'assistant-chat',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sessionKey: state.sessionKey, greeted: state.greeted, messages: state.messages }),
    }
  )
)
