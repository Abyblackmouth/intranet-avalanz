'use client'

// Piezas que comparten las pantallas del módulo Workflows. Mismo estilo que
// IT Service Desk, con bordes un poco más visibles (slate-300).
import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { buscarUsuariosIntranet, UsuarioIntranet } from '@/services/workflowsService'

export const inputCls = 'bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 outline-none hover:border-slate-400 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15 transition max-md:text-base'
export const labelCls = 'block text-[12px] font-semibold text-slate-600 mb-1'
export const btnPrimario = 'inline-flex items-center gap-1.5 rounded-lg bg-[#1a4fa0] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
export const btnSecundario = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-[#1a4fa0] hover:text-[#1a4fa0] disabled:opacity-50 disabled:cursor-not-allowed'
export const btnPeligro = 'inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50'

export const errMsg = (e: unknown, fb: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fb
}
export const fmtFecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export function Seccion({ titulo, sub, children, accion, className = '' }: { titulo: string; sub?: string; children: React.ReactNode; accion?: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-slate-300 rounded-2xl shadow-sm ${className}`}>
      <header className="px-5 py-3.5 border-b border-slate-200 flex items-start justify-between gap-3 max-md:px-4">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">{titulo}</h3>
          {sub && <p className="text-[12.5px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {accion}
      </header>
      <div className="px-5 py-4 max-md:px-4">{children}</div>
    </section>
  )
}

export function Interruptor({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Modal({ titulo, onClose, children, ancho = 'max-w-md' }: { titulo: string; onClose: () => void; children: React.ReactNode; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${ancho} max-h-[92dvh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-base font-semibold text-slate-800">{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}

/** Buscador de usuarios de la Intranet (por nombre o correo) con sugerencias. */
export function BuscadorUsuario({ valor, onElegir, placeholder = 'Buscar por nombre o correo' }: { valor: UsuarioIntranet | null; onElegir: (u: UsuarioIntranet | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<UsuarioIntranet[]>([])
  const [abierto, setAbierto] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (t.current) clearTimeout(t.current)
    if (q.trim().length < 2) { setRes([]); return }
    t.current = setTimeout(async () => {
      try { const r = await buscarUsuariosIntranet(q.trim()); setRes(r.data ?? []); setAbierto(true) } catch { setRes([]) }
    }, 250)
  }, [q])
  if (valor) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-slate-800 truncate">{valor.name}</span>
        <span className="text-[12px] text-slate-400 truncate">{valor.email}</span>
        <button type="button" onClick={() => onElegir(null)} className="text-[12.5px] text-[#1a4fa0] hover:underline shrink-0">Cambiar</button>
      </div>
    )
  }
  return (
    <div className="relative w-full">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input className={`${inputCls} w-full pl-8`} placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)}
        onFocus={() => res.length && setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} />
      {abierto && res.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-300 rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto">
          {res.map(u => (
            <li key={u.id}>
              <button type="button" onMouseDown={e => { e.preventDefault(); onElegir(u); setQ(''); setAbierto(false) }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50">
                <span className="block text-sm text-slate-800">{u.name}{u.is_locked && <span className="ml-2 text-[11px] text-slate-400">bloqueado</span>}</span>
                <span className="block text-[12px] text-slate-500">{u.email}{u.puesto ? ` · ${u.puesto}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
