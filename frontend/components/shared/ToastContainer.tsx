'use client'
import { useEffect, useState } from 'react'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { useToastStore, Toast, ToastType } from '@/store/toastStore'

const TOAST_DURATION = 9000

const toastStyles: Record<ToastType, {
  bg: string
  border: string
  icon: React.ReactNode
  titleColor: string
}> = {
  info: {
    bg: 'bg-blue-600',
    border: 'border-blue-700',
    icon: <Info size={18} className="text-white shrink-0 mt-0.5" />,
    titleColor: 'text-white',
  },
  success: {
    bg: 'bg-emerald-600',
    border: 'border-emerald-700',
    icon: <CheckCircle size={18} className="text-white shrink-0 mt-0.5" />,
    titleColor: 'text-white',
  },
  warning: {
    bg: 'bg-amber-500',
    border: 'border-amber-600',
    icon: <AlertTriangle size={18} className="text-white shrink-0 mt-0.5" />,
    titleColor: 'text-white',
  },
  error: {
    bg: 'bg-red-600',
    border: 'border-red-700',
    icon: <AlertCircle size={18} className="text-white shrink-0 mt-0.5" />,
    titleColor: 'text-white',
  },
}

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
    const enterTimer = setTimeout(() => setVisible(true), 10)
    const closeTimer = setTimeout(() => dismiss(), TOAST_DURATION)
    return () => {
      clearTimeout(enterTimer)
      clearTimeout(closeTimer)
    }
  }, [])

  return (
    <div
      className={`
        flex items-start gap-3 w-96 px-4 py-4 rounded-xl shadow-2xl border
        ${style.bg} ${style.border}
        transition-all duration-300 ease-out
        ${visible && !leaving
          ? 'translate-y-0 opacity-100'
          : leaving
            ? '-translate-y-4 opacity-0'
            : 'translate-y-4 opacity-0'
        }
      `}
    >
      {style.icon}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${style.titleColor}`}>
          {toast.title}
        </p>
        {toast.body && (
          <p className="text-xs text-white/80 mt-0.5 leading-relaxed line-clamp-3">
            {toast.body}
          </p>
        )}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 w-5 h-5 flex items-center justify-center text-white/70 hover:text-white transition rounded"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts } = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  )
}
