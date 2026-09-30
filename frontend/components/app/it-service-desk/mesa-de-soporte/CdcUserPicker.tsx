'use client'

import { useEffect, useState } from 'react'
import { searchCdcUsuarios } from '@/services/itServiceDeskService'
import { X, Search } from 'lucide-react'

export interface PickedUser { id: string; name: string; email?: string; puesto?: string | null; departamento?: string | null }

export default function CdcUserPicker({ label, hint, value, onChange }: {
  label: string; hint?: string; value: PickedUser | null; onChange: (u: PickedUser | null) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PickedUser[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try { const r = await searchCdcUsuarios(q.trim()); setResults(Array.isArray(r.data) ? r.data : []) }
      catch { setResults([]) }
      finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{label}<span className="text-red-600 ml-0.5">*</span></label>
      {value ? (
        <div className="flex items-center gap-2.5 border-[1.5px] border-slate-200 rounded-[10px] px-3 py-2 bg-white">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 leading-snug">{value.name}</p>
            {(value.puesto || value.departamento) && <p className="text-xs text-slate-500">{[value.puesto, value.departamento].filter(Boolean).join(' · ')}</p>}
          </div>
          <button type="button" onClick={() => { onChange(null); setQ('') }} aria-label={`Quitar ${label}`} className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Busca por nombre o correo"
            className="w-full bg-white border-[1.5px] border-slate-200 rounded-[10px] pl-9 pr-3 py-2 text-sm outline-none transition focus:border-[#1a4fa0] focus:ring-[3.5px] focus:ring-[#1a4fa0]/10" />
          {open && q.trim().length >= 2 && (
            <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-slate-200 rounded-[10px] shadow-lg py-1">
              {loading && <li className="px-3 py-2 text-[13px] text-slate-500">Buscando…</li>}
              {!loading && results.length === 0 && <li className="px-3 py-2 text-[13px] text-slate-500">Sin resultados. Revisa el nombre o prueba con el correo.</li>}
              {!loading && results.map(u => (
                <li key={u.id}>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(u); setOpen(false); setQ('') }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50">
                    <span className="block text-sm text-slate-800">{u.name}</span>
                    <span className="block text-xs text-slate-500">{[u.puesto, u.departamento, u.email].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
