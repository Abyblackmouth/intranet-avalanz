// ----------------------------------------------------------------------
// Estado del chat del asistente
// Persiste la conversacion para que abrir y cerrar el panel, o recargar
// la pagina, no la pierda. Se reinicia al cambiar de sesion (nuevo
// inicio de sesion), al reiniciar el chat o al cerrar sesion.
// ----------------------------------------------------------------------
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AssistantConfidence, AssistantResult } from '@/services/assistantService'

// Maximo de mensajes que se conservan
const MAX_MESSAGES = 50

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  results?: AssistantResult[]
  confidence?: AssistantConfidence
  showTicket?: boolean
  module?: string
  createdAt: number
}

interface AssistantState {
  sessionKey: string
  greeted: boolean
  isOpen: boolean
  messages: ChatMessage[]
  syncSession: (key: string) => void
  setOpen: (open: boolean) => void
  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'>) => void
  markGreeted: () => void
  resetChat: () => void
  clearAll: () => void
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => ({
      sessionKey: '',
      greeted: false,
      isOpen: false,
      messages: [],

      // Sesion nueva: conversacion nueva y saludo nuevo
      syncSession: (key) => {
        if (key && key !== get().sessionKey) {
          set({ sessionKey: key, greeted: false, isOpen: false, messages: [] })
        }
      },
      setOpen: (open) => set({ isOpen: open }),
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, { ...message, id: newId(), createdAt: Date.now() }].slice(-MAX_MESSAGES),
        })),
      markGreeted: () => set({ greeted: true }),
      // Reiniciar conserva el saludo como ya hecho en esta sesion
      resetChat: () => set({ messages: [] }),
      clearAll: () => set({ sessionKey: '', greeted: false, isOpen: false, messages: [] }),
    }),
    {
      name: 'assistant-chat',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sessionKey: state.sessionKey, greeted: state.greeted, messages: state.messages }),
    }
  )
)
