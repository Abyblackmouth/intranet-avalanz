'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Mesa de Soporte en el telefono (menos de 768 px). La tabla se vuelve lista:
// cada ticket es un renglon tactil. Busqueda, tipos y filtros arriba; los
// filtros en una hoja que sube desde abajo; nuevo ticket en un circulo con +.
// Usa los mismos datos, filtros y modales que la vista de escritorio.
// ─────────────────────────────────────────────────────────────────────────────

const FINALES = new Set(['resuelto', 'cerrado', 'terminado', 'rechazado', 'cancelado'])
const TIPOS: [string, string][] = [['incidente', 'Incidentes'], ['solicitud_acceso', 'Accesos'], ['control_cambio', 'Cambios']]
type Estado = 'todos' | 'abiertos' | 'vencidos' | 'terminados'

const ms = (v?: string | null) => (v ? new Date(v).getTime() : null)
const esFinal = (t: any) => FINALES.has(t.status)
const vencido = (t: any, ahora: number) => !esFinal(t) && (ms(t.sla_resolution_limit) ?? Infinity) < ahora

function horas(diff: number) {
  const h = Math.round(diff / 3_600_000)
  return h >= 24 ? `${Math.round(h / 24)}d` : `${Math.max(1, h)}h`
}

/** Estado del SLA de respuesta (R) o de resolucion (S) para el chip del renglon. */
function chipSla(t: any, cual: 'R' | 'S', ahora: number): { clase: string; texto: string } | null {
  const limite = ms(cual === 'R' ? t.sla_response_limit : t.sla_resolution_limit)
  if (!limite) return null
  const hecho = ms(cual === 'R' ? t.first_response_at : (esFinal(t) ? (t.resolved_at ?? t.closed_at) : null))
  if (hecho) return hecho <= limite ? { clase: 'bg-emerald-50 text-emerald-700', texto: cual } : { clase: 'bg-red-50 text-red-700', texto: cual }
  if (cual === 'S' && esFinal(t)) return { clase: 'bg-emerald-50 text-emerald-700', texto: cual }
  if (limite < ahora) return { clase: 'bg-red-50 text-red-700', texto: `${cual} vencido` }
  if (limite - ahora < 24 * 3_600_000) return { clase: 'bg-amber-50 text-amber-700', texto: `${cual} ${horas(limite - ahora)}` }
  return { clase: 'bg-emerald-50 text-emerald-700', texto: cual }
}

function claseEstatus(status: string) {
  if (['resuelto', 'cerrado', 'terminado'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['rechazado', 'cancelado'].includes(status)) return 'bg-red-50 text-red-700'
  if (status === 'en_revision') return 'bg-blue-50 text-[#1a4fa0]'
  if (status === 'en_firma') return 'bg-pink-50 text-pink-700'
  if (status === 'asignado' || status === 'en_proceso') return 'bg-indigo-50 text-indigo-700'
  return 'bg-amber-50 text-amber-700'
}

const CLASE_SEV: Record<string, string> = {
  S1: 'border-red-200 bg-red-50 text-red-700', S2: 'border-orange-200 bg-orange-50 text-orange-700',
  S3: 'border-amber-200 bg-amber-50 text-amber-700', S4: 'border-slate-200 bg-slate-50 text-slate-600',
}
const iniciales = (n?: string | null) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

interface Props {
  todos: any[]                  // todos los tickets (para los conteos por tipo)
  filtrados: any[]              // los que ya pasan la busqueda y los filtros de la pantalla
  cargando: boolean
  busqueda: string
  onBusqueda: (v: string) => void
  tipos: string[]
  onTipos: (v: string[]) => void
  sevs: string[]
  onSevs: (v: string[]) => void
  codigosSev: string[]
  sevDe: (t: any) => string | undefined
  estatusDe: (t: any) => string
  nuevos: Set<string>
  onAbrir: (id: string) => void
  onNuevo: () => void
}

export default function MesaMovil({ todos, filtrados, cargando, busqueda, onBusqueda, tipos, onTipos, sevs, onSevs, codigosSev,
  sevDe, estatusDe, nuevos, onAbrir, onNuevo }: Props) {
  const [estado, setEstado] = useState<Estado>('todos')
  const [empresas, setEmpresas] = useState<string[]>([])
  const [hoja, setHoja] = useState(false)
  const [mostrar, setMostrar] = useState(30)
  const ahora = Date.now()

  const cumpleLocal = (t: any, est: Estado, emps: string[]) =>
    (est === 'todos' || (est === 'abiertos' && !esFinal(t)) || (est === 'vencidos' && vencido(t, ahora)) || (est === 'terminados' && esFinal(t)))
    && (!emps.length || emps.includes(t.requester_company_name))
  const lista = useMemo(() => filtrados.filter(t => cumpleLocal(t, estado, empresas)), [filtrados, estado, empresas]) // eslint-disable-line react-hooks/exhaustive-deps

  const porTipo = useMemo(() => {
    const c: Record<string, number> = {}
    for (const t of todos) { const k = t.ticket_type ?? (t.folio?.startsWith('CDC-') ? 'control_cambio' : 'incidente'); c[k] = (c[k] ?? 0) + 1 }
    return c
  }, [todos])
  const listaEmpresas = useMemo(() => {
    const c = new Map<string, number>()
    for (const t of filtrados) if (t.requester_company_name) c.set(t.requester_company_name, (c.get(t.requester_company_name) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [filtrados])

  const abiertos = filtrados.filter(t => !esFinal(t)).length
  const vencidos = filtrados.filter(t => vencido(t, ahora)).length
  const cuantosNuevos = filtrados.filter(t => nuevos.has(t.id)).length
  const activos = (estado !== 'todos' ? 1 : 0) + empresas.length + sevs.length
  const alternar = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  return (
    <div className="min-h-full bg-white md:hidden">
      {/* Arriba: busqueda, filtros y tipos (fijos al hacer scroll) */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="px-4 pt-2 pb-2 max-[380px]:px-3">
        <div className="flex gap-2">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 text-slate-400">
            <Search size={18} className="shrink-0" />
            <input value={busqueda} onChange={e => { onBusqueda(e.target.value); setMostrar(30) }} placeholder="Folio o título"
              aria-label="Buscar ticket" autoComplete="off" enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400" />
            {busqueda && <button type="button" onClick={() => onBusqueda('')} aria-label="Borrar búsqueda" className="grid size-8 place-items-center rounded-lg"><X size={16} /></button>}
          </label>
          <button type="button" onClick={() => setHoja(true)} aria-label="Filtros"
            className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-800 active:bg-slate-50">
            <SlidersHorizontal size={20} />
            {activos > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-[#1a4fa0] px-1 text-[10.5px] font-bold text-white">{activos}</span>}
          </button>
        </div>
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] max-[380px]:-mx-3 max-[380px]:px-3">
          {TIPOS.map(([k, nombre]) => {
            const on = tipos.length === 1 && tipos[0] === k
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => { onTipos(on ? [] : [k]); setMostrar(30) }}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800'}`}>
                {nombre}<span className={`text-xs ${on ? 'text-slate-300' : 'text-slate-500'}`}>{porTipo[k] ?? 0}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex gap-3.5 border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-500 max-[380px]:px-3">
        <span><b className="font-semibold text-slate-900">{abiertos}</b> abiertos</span>
        <span><b className="font-semibold text-red-700">{vencidos}</b> vencidos</span>
        {cuantosNuevos > 0 && <span><b className="font-semibold text-slate-900">{cuantosNuevos}</b> nuevos</span>}
        <span className="ml-auto">{lista.length} {lista.length === 1 ? 'ticket' : 'tickets'}</span>
      </div>
      </div>


      {/* Lista */}
      {cargando ? (
        <div className="py-16 text-center"><div className="mx-auto size-7 animate-spin rounded-full border-2 border-[#1a4fa0] border-t-transparent" /></div>
      ) : !lista.length ? (
        <div className="px-6 py-16 text-center">
          <p className="font-semibold text-slate-800">Sin tickets con estos filtros</p>
          <button type="button" onClick={() => { setEstado('todos'); setEmpresas([]); onSevs([]); onTipos([]); onBusqueda('') }}
            className="mt-3 h-11 rounded-xl px-4 text-sm font-semibold text-[#1a4fa0] active:bg-blue-50">Quitar filtros</button>
        </div>
      ) : (
        <ul className="pb-24">
          {lista.slice(0, mostrar).map(t => {
            const sev = sevDe(t)
            const r = chipSla(t, 'R', ahora), s = chipSla(t, 'S', ahora)
            return (
              <li key={t.id} className="relative border-b border-slate-100">
                {nuevos.has(t.id) && <span className="absolute top-3 bottom-3 left-0 w-0.75 rounded-r bg-[#1a4fa0]" />}
                <button type="button" onClick={() => onAbrir(t.id)}
                  className="grid w-full grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 px-4 py-3 text-left active:bg-slate-50 max-[380px]:px-3">
                  <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-500">
                    {t.folio}
                    {sev && <span className={`rounded border px-1.5 font-sans text-[11px] font-bold ${CLASE_SEV[sev] ?? CLASE_SEV.S4}`}>{sev}</span>}
                  </span>
                  <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${claseEstatus(t.status)}`}>{estatusDe(t)}</span>
                  <span className="col-span-2 line-clamp-2 text-sm leading-snug font-semibold text-slate-900">{t.title}</span>
                  <span className="col-span-2 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-50 text-[9px] font-bold text-[#1a4fa0]">{iniciales(t.assigned_to_name)}</span>
                      <span className="truncate">{t.assigned_to_name ?? <i className="text-slate-400">Sin asignar</i>}</span>
                    </span>
                    {r && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${r.clase}`}>{r.texto}</span>}
                    {s && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${s.clase}`}>{s.texto}</span>}
                  </span>
                </button>
              </li>
            )
          })}
          {lista.length > mostrar && (
            <li className="p-4 text-center">
              <button type="button" onClick={() => setMostrar(m => m + 30)} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 active:bg-slate-50">
                Ver {Math.min(30, lista.length - mostrar)} más
              </button>
            </li>
          )}
        </ul>
      )}

      {/* Nuevo ticket: circulo con +, al alcance del pulgar */}
      <button type="button" onClick={onNuevo} aria-label="Nuevo ticket"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] z-30 grid size-14 place-items-center rounded-full bg-[#1a4fa0] text-white shadow-lg shadow-[#1a4fa0]/40 active:scale-95">
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {/* Hoja de filtros */}
      {hoja && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Filtros">
          <button type="button" aria-label="Cerrar filtros" onClick={() => setHoja(false)} className="absolute inset-0 bg-slate-900/40" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl bg-white px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <span className="mx-auto mb-2.5 h-1.25 w-10 rounded-full bg-slate-300" />
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Filtros</h2>
              <button type="button" onClick={() => { setEstado('todos'); setEmpresas([]); onSevs([]) }} className="h-11 px-2 text-sm font-semibold text-[#1a4fa0]">Limpiar</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <fieldset className="border-b border-slate-100 py-3">
                <legend className="mb-2 text-[13px] font-semibold text-slate-500">Estado</legend>
                <div className="flex flex-wrap gap-1.5">
                  {([['todos', 'Todos'], ['abiertos', 'Abiertos'], ['vencidos', 'Vencidos'], ['terminados', 'Terminados']] as [Estado, string][]).map(([k, n]) => (
                    <button key={k} type="button" aria-pressed={estado === k} onClick={() => setEstado(k)}
                      className={`h-9 rounded-xl border px-3 text-sm ${estado === k ? 'border-[#1a4fa0] bg-blue-50 font-semibold text-[#1a4fa0]' : 'border-slate-200 text-slate-700'}`}>
                      {n} <span className="text-xs text-slate-400">{filtrados.filter(t => cumpleLocal(t, k, [])).length}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="border-b border-slate-100 py-3">
                <legend className="mb-2 text-[13px] font-semibold text-slate-500">Severidad</legend>
                <div className="flex flex-wrap gap-1.5">
                  {codigosSev.map(c => (
                    <button key={c} type="button" aria-pressed={sevs.includes(c)} onClick={() => onSevs(alternar(sevs, c))}
                      className={`grid h-9 min-w-14 place-items-center rounded-xl border px-2 ${sevs.includes(c) ? 'border-[#1a4fa0] bg-blue-50' : 'border-slate-200'}`}>
                      <span className={`rounded border px-1.5 text-[11px] font-bold ${CLASE_SEV[c] ?? CLASE_SEV.S4}`}>{c}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {listaEmpresas.length > 0 && (
                <fieldset className="py-3">
                  <legend className="mb-1 text-[13px] font-semibold text-slate-500">Empresa</legend>
                  {listaEmpresas.map(([emp, n]) => (
                    <label key={emp} className="flex h-11 items-center gap-2.5 text-[15px] text-slate-800">
                      <input type="checkbox" checked={empresas.includes(emp)} onChange={() => setEmpresas(alternar(empresas, emp))}
                        className="size-5 shrink-0 rounded-md accent-[#1a4fa0]" />
                      <span className="flex-1 truncate">{emp}</span>
                      <span className="text-[13px] text-slate-400">{n}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
            <button type="button" onClick={() => { setHoja(false); setMostrar(30) }}
              className="mt-3 h-12.5 rounded-2xl bg-[#1a4fa0] text-[15px] font-bold text-white active:bg-[#173f82]">
              Ver {lista.length} {lista.length === 1 ? 'ticket' : 'tickets'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
