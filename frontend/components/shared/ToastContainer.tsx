'use client'

import { useEffect, useState } from 'react'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { useToastStore, Toast, ToastType } from '@/store/toastStore'

const TOAST_DURATION = 5000

// ── Colores por tipo ──────────────────────────────────────────────────────────
const toastStyles: Record<ToastType, {
  bg: string
  border: string
  icon: React.ReactNode
  titleColor: string
}> = {
  info: {
    bg: 'bg-white',
    border: 'border-blue-200',
    icon: <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />,
    titleColor: 'text-slate-800',
  },
  success: {
    bg: 'bg-white',
    border: 'border-emerald-200',
    icon: <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />,
    titleColor: 'text-slate-800',
  },
  warning: {
    bg: 'bg-white',
    border: 'border-amber-200',
    icon: <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />,
    titleColor: 'text-slate-800',
  },
  error: {
    bg: 'bg-white',
    border: 'border-red-200',
    icon: <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />,
    titleColor: 'text-slate-800',
  },
}

// ── Item individual de toast ──────────────────────────────────────────────────
function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToastStore()
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const style = toastStyles[toast.type] ?? toastStyles.info

  const dismiss = () => {
    setLeaving(true)
    setTimeout(() => removeToast(toast.id), 350)
  }

  useEffect(() => {
    // Entrada — pequeño delay para activar la animación CSS
    const enterTimer = setTimeout(() => setVisible(true), 10)

    // Auto-cierre
    const closeTimer = setTimeout(() => dismiss(), TOAST_DURATION)

    return () => {
      clearTimeout(enterTimer)
      clearTimeout(closeTimer)
    }
  }, [])

  return (
    <div
      className={`
        flex items-start gap-3 w-80 px-4 py-3.5 rounded-xl shadow-lg border
        ${style.bg} ${style.border}
        transition-all duration-350 ease-out
        ${visible && !leaving
          ? 'translate-y-0 opacity-100'
          : leaving
            ? '-translate-y-2 opacity-0'
            : 'translate-y-8 opacity-0'
        }
      `}
    >
      {style.icon}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${style.titleColor}`}>
          {toast.title}
        </p>
        {toast.body && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
            {toast.body}
          </p>
        )}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition rounded"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ── Contenedor de toasts ──────────────────────────────────────────────────────
export default function ToastContainer() {
  const { toasts } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  )
}
