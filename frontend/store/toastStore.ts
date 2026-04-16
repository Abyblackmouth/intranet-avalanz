import { create } from 'zustand'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  type: ToastType
  title: string
  body: string
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const MAX_TOASTS = 3

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) =>
    set((state) => {
      const newToast: Toast = {
        ...toast,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }
      const updated = [newToast, ...state.toasts].slice(0, MAX_TOASTS)
      return { toasts: updated }
    }),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
