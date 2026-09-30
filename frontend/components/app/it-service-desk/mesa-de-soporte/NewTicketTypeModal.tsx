'use client'

import { useState, useEffect } from 'react'
import { X, AlertTriangle, GitBranch, KeyRound } from 'lucide-react'

interface NewTicketTypeModalProps {
  onClose: () => void
  onSelect: (type: 'incidente' | 'control_cambio' | 'solicitud_acceso') => void
}

const OPTIONS = [
  {
    type: 'incidente' as const,
    icon: AlertTriangle,
    label: 'Incidente',
    desc: 'Algo no funciona o dejó de funcionar',
    color: '#7c2d12',
    available: true,
  },
  {
    type: 'control_cambio' as const,
    icon: GitBranch,
    label: 'Control de Cambios',
    desc: 'Funcionalidad nueva o mejora a algo existente',
    color: '#1a4fa0',
    available: true,
  },
  {
    type: 'solicitud_acceso' as const,
    icon: KeyRound,
    label: 'Solicitud de Accesos',
    desc: 'Alta, baja o cambio de acceso a un sistema',
    color: '#059669',
    available: false,
  },
]

export default function NewTicketTypeModal({ onClose, onSelect }: NewTicketTypeModalProps) {
  const [shellIn, setShellIn] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    const t0 = setTimeout(() => setShellIn(true), 10)
    const timers = OPTIONS.map((_, i) => setTimeout(() => setVisibleCount(v => Math.max(v, i + 1)), 180 + i * 90))
    return () => { clearTimeout(t0); timers.forEach(clearTimeout) }
  }, [])

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${shellIn ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-7 relative pointer-events-auto transition-all"
          style={{
            transitionDuration: '420ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            transformOrigin: 'top right',
            transform: shellIn ? 'scale(1)' : 'scale(0.15)',
            opacity: shellIn ? 1 : 0,
          }}
        >
          <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">¿En qué te podemos ayudar?</h2>
            <p className="text-xs text-slate-400 mt-1">Elige el tipo de ticket para continuar.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {OPTIONS.map((opt, i) => {
              const Icon = opt.icon
              const shown = i < visibleCount
              return (
                <button
                  key={opt.type}
                  onClick={() => opt.available && onSelect(opt.type)}
                  disabled={!opt.available}
                  className={`flex flex-col items-center text-center gap-2.5 p-5 rounded-xl border transition-all duration-300 ease-out ${
                    opt.available
                      ? 'border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                      : 'border-slate-100 opacity-60 cursor-not-allowed'
                  }`}
                  style={{
                    opacity: shown ? (opt.available ? 1 : 0.6) : 0,
                    transform: shown ? 'translateY(0)' : 'translateY(14px)',
                  }}
                >
                  <Icon size={34} strokeWidth={1.5} style={{ color: opt.color }} />
                  <div>
                    <p className="text-sm font-bold text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-snug">{opt.desc}</p>
                  </div>
                  {!opt.available && (
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      Próximamente
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
