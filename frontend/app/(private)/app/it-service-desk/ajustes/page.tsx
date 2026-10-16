'use client'

import { useCallback, useEffect, useState } from 'react'
import { Lock, Check, X } from 'lucide-react'
import api from '@/services/api'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { getAjustes, getAjustesHistorial, updateAjuste } from '@/services/itServiceDeskService'

interface Ajuste {
  key: string; grupo: string; label: string; descripcion: string; tipo: 'bool' | 'int' | 'opcion' | 'usuarios'
  default: string; valor: string; opciones?: [string, string][]; min?: number; max?: number; fuente?: string
}
interface Cambio { key: string; label: string; anterior: string | null; nuevo: string; usuario: string; fecha: string }

const errMsg = (e: any, fb: string) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : fb }
const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Persona { id: string; nombre: string; bloqueado?: boolean }
const leerLista = (v: string): Persona[] => { try { const l = JSON.parse(v || '[]'); return Array.isArray(l) ? l : [] } catch { return [] } }
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Ajuste de tipo "lista de personas": chips que se quitan con la X y un buscador para agregar */
function ControlUsuarios({ a, onSave }: { a: Ajuste; onSave: (valor: string) => Promise<boolean> }) {
  const elegidos = leerLista(a.valor)
  const [opciones, setOpciones] = useState<Persona[]>([])
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    if (a.fuente) api.get(`/api/v1/it-service-desk/ajustes/opciones/${a.fuente}`).then(r => setOpciones(r.data ?? [])).catch(() => setOpciones([]))
  }, [a.fuente])
  const ids = new Set(elegidos.map(p => p.id))
  const sugerencias = opciones.filter(o => !ids.has(o.id) && sinAcentos(o.nombre).includes(sinAcentos(q))).slice(0, 8)
  const guardar = (l: Persona[]) => onSave(JSON.stringify(l.map(p => ({ id: p.id, nombre: p.nombre }))))
  return (
    <div className="w-full max-w-md">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {elegidos.length === 0 && <span className="text-[12px] text-slate-400">Nadie excluido</span>}
        {elegidos.map(p => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-2.5 text-[12.5px] font-medium text-slate-700">
            {p.nombre}
            <button type="button" aria-label={`Quitar a ${p.nombre}`} onClick={() => guardar(elegidos.filter(x => x.id !== p.id))}
              className="grid size-5 place-items-center rounded-full text-slate-500 hover:bg-slate-200"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input value={q} onChange={e => { setQ(e.target.value); setAbierto(true) }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder="Buscar para agregar…" aria-label={`Agregar a ${a.label}`}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15" />
        {abierto && sugerencias.length > 0 && (
          <ul className="absolute inset-x-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {sugerencias.map(o => (
              <li key={o.id}>
                <button type="button" onMouseDown={e => { e.preventDefault(); setQ(''); guardar([...elegidos, o]) }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-blue-50">
                  <span className="truncate">{o.nombre}</span>{o.bloqueado && <span className="text-[11px] text-slate-400">bloqueado</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Control({ a, onSave }: { a: Ajuste; onSave: (valor: string | number | boolean) => Promise<boolean> }) {
  const [num, setNum] = useState(a.valor)
  useEffect(() => { setNum(a.valor) }, [a.valor])
  if (a.tipo === 'usuarios') return <ControlUsuarios a={a} onSave={v => onSave(v)} />
  if (a.tipo === 'bool') {
    const on = a.valor === 'true'
    return (
      <button type="button" role="switch" aria-checked={on} aria-label={a.label} onClick={() => onSave(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4.5 w-4.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5.5' : 'translate-x-[3px]'}`} />
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
    if (a?.tipo === 'usuarios') { const l = leerLista(v); return l.length ? l.map(p => p.nombre).join(', ') : 'Nadie' }
    return v
  }

  return (
    <div className="px-6 pt-3 pb-6 max-[1440px]:px-4 max-md:px-3 max-md:pb-4">
      {loading ? (
        <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="grid min-w-0 gap-5">
          {grupos.map(g => (
            <section key={g} className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <h2 className="px-5 py-3.5 border-b border-slate-100 font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">{g}</h2>
              <ul>
                {ajustes.filter(a => a.grupo === g).map(a => (
                  <li key={a.key} className="px-5 py-4 border-b border-slate-100 last:border-0 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex-1 min-w-65">
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
          </div>

          {/* Historial: a la derecha en pantallas anchas, fijo al hacer scroll y con su propio desplazamiento */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm xl:sticky xl:top-0 xl:flex xl:max-h-[calc(100dvh-7rem)] xl:flex-col">
            <h2 className="px-5 py-3.5 border-b border-slate-100 font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">Historial de cambios</h2>
            {historial.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-slate-400">Todavía no hay cambios registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100 xl:min-h-0 xl:overflow-y-auto">
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
    </div>
  )
}
