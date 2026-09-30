'use client'

import { useCallback, useEffect, useState } from 'react'
import { Lock, Check } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { getAjustes, getAjustesHistorial, updateAjuste } from '@/services/itServiceDeskService'

interface Ajuste {
  key: string; grupo: string; label: string; descripcion: string; tipo: 'bool' | 'int' | 'opcion'
  default: string; valor: string; opciones?: [string, string][]; min?: number; max?: number
}
interface Cambio { key: string; label: string; anterior: string | null; nuevo: string; usuario: string; fecha: string }

const errMsg = (e: any, fb: string) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : fb }
const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Control({ a, onSave }: { a: Ajuste; onSave: (valor: string | number | boolean) => Promise<boolean> }) {
  const [num, setNum] = useState(a.valor)
  useEffect(() => { setNum(a.valor) }, [a.valor])
  if (a.tipo === 'bool') {
    const on = a.valor === 'true'
    return (
      <button type="button" role="switch" aria-checked={on} aria-label={a.label} onClick={() => onSave(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4.5 w-4.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
      </button>
    )
  }
  if (a.tipo === 'int') {
    const guardar = () => { if (num !== a.valor) onSave(Number(num)).then(ok => { if (!ok) setNum(a.valor) }) }
    return (
      <div className="flex items-center gap-2">
        <input type="number" inputMode="numeric" min={a.min} max={a.max} value={num} aria-label={a.label}
          onChange={e => setNum(e.target.value)} onBlur={guardar} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-24 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-right outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15" />
        {a.min !== undefined && <span className="text-[12px] text-slate-400">de {a.min} a {a.max}</span>}
      </div>
    )
  }
  return (
    <div role="radiogroup" aria-label={a.label} className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-sm">
      {(a.opciones ?? []).map(([v, l], i) => (
        <button key={v} type="button" role="radio" aria-checked={a.valor === v} onClick={() => a.valor !== v && onSave(v)}
          className={`px-3.5 py-1.5 ${i ? 'border-l border-slate-200' : ''} ${a.valor === v ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
      ))}
    </div>
  )
}

export default function AjustesPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [ajustes, setAjustes] = useState<Ajuste[]>([])
  const [historial, setHistorial] = useState<Cambio[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<Record<string, { ok: boolean; text: string }>>({})
  useEffect(() => { setMounted(true) }, [])
  const esAdmin = mounted && isSuperAdmin()

  const cargar = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([getAjustes(), getAjustesHistorial()])
      setAjustes(a.data ?? []); setHistorial(h.data ?? [])
    } catch { /* sin permiso: la pantalla lo indica */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (esAdmin) cargar(); else if (mounted) setLoading(false) }, [esAdmin, mounted, cargar])

  const guardar = async (a: Ajuste, valor: string | number | boolean) => {
    setEstado(s => ({ ...s, [a.key]: { ok: true, text: 'Guardando…' } }))
    try {
      const r = await updateAjuste(a.key, valor)
      setAjustes(prev => prev.map(x => x.key === a.key ? { ...x, valor: r.data.valor } : x))
      setEstado(s => ({ ...s, [a.key]: { ok: true, text: r.data.cambio ? 'Guardado' : 'Sin cambios' } }))
      getAjustesHistorial().then(h => setHistorial(h.data ?? [])).catch(() => {})
      setTimeout(() => setEstado(s => { const n = { ...s }; delete n[a.key]; return n }), 2500)
      return true
    } catch (e) {
      setEstado(s => ({ ...s, [a.key]: { ok: false, text: errMsg(e, 'No se pudo guardar') } }))
      return false
    }
  }

  if (!mounted) return null
  if (!esAdmin) {
    return (
      <PageWrapper title="Ajustes" description="Configuración del IT Service Desk">
        <div className="max-w-md mx-auto mt-16 text-center bg-white border border-slate-200 rounded-2xl p-8">
          <Lock className="w-8 h-8 mx-auto text-slate-400" />
          <p className="mt-3 font-semibold text-slate-800">Solo el super admin puede ver los ajustes</p>
          <p className="mt-1 text-sm text-slate-500">Si necesitas cambiar alguno, pídeselo al administrador de la intranet.</p>
        </div>
      </PageWrapper>
    )
  }

  const grupos = Array.from(new Set(ajustes.map(a => a.grupo)))
  const etiquetaValor = (key: string, v: string | null) => {
    const a = ajustes.find(x => x.key === key)
    if (v === null) return '—'
    if (a?.tipo === 'bool') return v === 'true' ? 'Activo' : 'Inactivo'
    if (a?.tipo === 'opcion') return a.opciones?.find(o => o[0] === v)?.[1] ?? v
    return v
  }

  return (
    <PageWrapper title="Ajustes" description="Configuración del IT Service Desk · solo super admin">
      {loading ? (
        <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
      ) : (
        <div className="max-w-4xl grid gap-5">
          {grupos.map(g => (
            <section key={g} className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <h2 className="px-5 py-3.5 border-b border-slate-100 font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">{g}</h2>
              <ul>
                {ajustes.filter(a => a.grupo === g).map(a => (
                  <li key={a.key} className="px-5 py-4 border-b border-slate-100 last:border-0 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex-1 min-w-[260px]">
                      <p className="text-[14px] font-semibold text-slate-800">{a.label}</p>
                      <p className="text-[13px] text-slate-500 mt-0.5 max-w-[62ch]">{a.descripcion}</p>
                      <p className="text-[11px] font-mono text-slate-400 mt-1">{a.key}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Control a={a} onSave={v => guardar(a, v)} />
                      {estado[a.key] && (
                        <span role="status" className={`text-[12px] inline-flex items-center gap-1 ${estado[a.key].ok ? 'text-emerald-700' : 'text-red-600'}`}>
                          {estado[a.key].ok && estado[a.key].text === 'Guardado' && <Check size={12} />}{estado[a.key].text}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <h2 className="px-5 py-3.5 border-b border-slate-100 font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">Historial de cambios</h2>
            {historial.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-slate-400">Todavía no hay cambios registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {historial.map((c, i) => (
                  <li key={i} className="px-5 py-2.5 text-[13px] flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-slate-800">{c.label}</span>
                    <span className="text-slate-500">{etiquetaValor(c.key, c.anterior)} → <b className="text-slate-800">{etiquetaValor(c.key, c.nuevo)}</b></span>
                    <span className="ml-auto text-[12px] text-slate-400">{c.usuario} · {fmt(c.fecha)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageWrapper>
  )
}
