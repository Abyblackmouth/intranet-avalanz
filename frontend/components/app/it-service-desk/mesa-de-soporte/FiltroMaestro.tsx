'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter, X } from 'lucide-react'

// Filtro maestro de la Mesa de Soporte: un solo campo que filtra por asignado,
// solicitante, empresa, sistema, modulo y estado del SLA. Las opciones salen de
// los tickets ya cargados. Dentro de un mismo grupo las opciones se suman (O);
// entre grupos se combinan (Y).

export type CampoMaestro = 'asignado' | 'solicitante' | 'empresa' | 'sistema' | 'modulo' | 'sla'
export interface FiltroMaestroItem { campo: CampoMaestro; valor: string; etiqueta: string }
type Catalogo = { id: string; name: string }[]

const GRUPOS: { campo: CampoMaestro; titulo: string }[] = [
  { campo: 'sla', titulo: 'SLA de resolución' },
  { campo: 'asignado', titulo: 'Asignado a' },
  { campo: 'solicitante', titulo: 'Solicitante' },
  { campo: 'empresa', titulo: 'Empresa' },
  { campo: 'sistema', titulo: 'Sistema' },
  { campo: 'modulo', titulo: 'Módulo' },
]
const CORTO: Record<CampoMaestro, string> = {
  sla: 'SLA', asignado: 'Asignado', solicitante: 'Solicitante', empresa: 'Empresa', sistema: 'Sistema', modulo: 'Módulo',
}

// ── Estado de un SLA (misma regla que el reloj de la fila) ─────────────────
export type EstadoSla = 'ok' | 'tarde' | 'vencido' | 'riesgo' | 'pend' | 'na'
export const ETIQUETA_SLA: Record<EstadoSla, string> = {
  vencido: 'Vencido', riesgo: 'Por vencer', pend: 'A tiempo', ok: 'Cumplido a tiempo', tarde: 'Cumplido tarde', na: 'No aplica',
}
export function estadoSla(inicio: string, limite?: string | null, cumplido?: string | null): EstadoSla {
  if (!limite) return 'na'
  const lim = new Date(limite).getTime(), ini = new Date(inicio).getTime(), ahora = Date.now()
  if (cumplido) return new Date(cumplido).getTime() <= lim ? 'ok' : 'tarde'
  return ahora > lim ? 'vencido' : (lim - ahora) < (lim - ini) * 0.25 ? 'riesgo' : 'pend'
}
const slaResolucion = (t: any) => estadoSla(t.created_at, t.sla_resolution_limit, t.resolved_at ?? t.closed_at)

const normaliza = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function valorDe(t: any, campo: CampoMaestro): string {
  switch (campo) {
    case 'asignado': return t.assigned_to_user_id ? String(t.assigned_to_user_id) : '__ninguno__'
    case 'solicitante': return t.requester_name ?? ''
    case 'empresa': return t.requester_company_name ?? ''
    case 'sistema': return t.system_id ? String(t.system_id) : ''
    case 'modulo': return t.module_id ? String(t.module_id) : ''
    case 'sla': return slaResolucion(t)
  }
}

// Se usa en la lista filtrada de la pagina
export function cumpleFiltroMaestro(t: any, filtros: FiltroMaestroItem[]): boolean {
  if (!filtros.length) return true
  const porCampo = new Map<CampoMaestro, Set<string>>()
  for (const f of filtros) {
    if (!porCampo.has(f.campo)) porCampo.set(f.campo, new Set())
    porCampo.get(f.campo)!.add(f.valor)
  }
  for (const [campo, valores] of porCampo) if (!valores.has(valorDe(t, campo))) return false
  return true
}

interface Opcion { campo: CampoMaestro; valor: string; etiqueta: string; n: number }

export default function FiltroMaestro({ tickets, sistemas, modulos, valor, onChange }: {
  tickets: any[]; sistemas: Catalogo; modulos: Catalogo; valor: FiltroMaestroItem[]; onChange: (v: FiltroMaestroItem[]) => void
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  // Opciones de cada grupo, con su numero de tickets
  const opciones = useMemo(() => {
    const nomSis = new Map(sistemas.map(s => [String(s.id), s.name]))
    const nomMod = new Map(modulos.map(m => [String(m.id), m.name]))
    const cuenta = new Map<string, Opcion>()
    for (const t of tickets) {
      for (const { campo } of GRUPOS) {
        const v = valorDe(t, campo)
        if (!v || (campo === 'sla' && v === 'na')) continue
        const etiqueta =
          campo === 'asignado' ? (v === '__ninguno__' ? 'Sin asignar' : (t.assigned_to_name ?? 'Sin nombre'))
          : campo === 'sistema' ? (nomSis.get(v) ?? 'Sistema')
          : campo === 'modulo' ? (nomMod.get(v) ?? 'Módulo')
          : campo === 'sla' ? ETIQUETA_SLA[v as EstadoSla]
          : v
        const k = campo + '|' + v
        const o = cuenta.get(k) ?? { campo, valor: v, etiqueta, n: 0 }
        o.n += 1
        cuenta.set(k, o)
      }
    }
    return Array.from(cuenta.values())
  }, [tickets, sistemas, modulos])

  const elegidos = new Set(valor.map(f => f.campo + '|' + f.valor))
  const q = normaliza(texto)
  const grupos = GRUPOS.map(g => {
    let lista = opciones.filter(o => o.campo === g.campo && !elegidos.has(o.campo + '|' + o.valor))
    if (q) lista = lista.filter(o => normaliza(o.etiqueta).includes(q))
    else if (g.campo !== 'sla') lista = lista.sort((a, b) => b.n - a.n).slice(0, 4)
    if (g.campo === 'sla') {
      const orden: EstadoSla[] = ['vencido', 'riesgo', 'pend', 'tarde', 'ok']
      lista = lista.sort((a, b) => orden.indexOf(a.valor as EstadoSla) - orden.indexOf(b.valor as EstadoSla))
    } else if (q) lista = lista.sort((a, b) => b.n - a.n).slice(0, 6)
    return { ...g, lista }
  }).filter(g => g.lista.length)
  const primera = grupos[0]?.lista[0]

  const agregar = (o: Opcion) => {
    onChange([...valor, { campo: o.campo, valor: o.valor, etiqueta: o.etiqueta }])
    setTexto('')
    entrada.current?.focus()
  }
  const quitar = (i: number) => onChange(valor.filter((_, k) => k !== i))

  const visibles = valor.slice(0, 2)
  const ocultos = valor.length - visibles.length

  return (
    <div ref={caja} className="relative flex-1 min-w-55">
      <div
        onClick={() => { setAbierto(true); entrada.current?.focus() }}
        className={`flex items-center gap-1.5 w-full pl-3 pr-2 py-1.5 min-h-9.5 text-sm rounded-xl border bg-white cursor-text transition
          ${abierto ? 'border-[#1a4fa0] ring-2 ring-[#1a4fa0]/20' : 'border-slate-300'}`}
      >
        <Filter size={14} className="text-slate-400 shrink-0" />
        {visibles.map((f, i) => (
          <span key={f.campo + f.valor} className="inline-flex items-center gap-1 max-w-45 shrink-0 rounded-md bg-[#eef4fc] text-[#1a4fa0] text-[12px] font-medium pl-2 pr-1 py-0.5">
            <span className="truncate"><span className="opacity-70">{CORTO[f.campo]}:</span> {f.etiqueta}</span>
            <button type="button" aria-label={`Quitar ${f.etiqueta}`} onClick={e => { e.stopPropagation(); quitar(i) }}
              className="rounded hover:bg-[#1a4fa0]/15 p-0.5"><X size={11} /></button>
          </span>
        ))}
        {ocultos > 0 && <span className="shrink-0 text-[12px] font-medium text-[#1a4fa0]" title={valor.slice(2).map(f => `${CORTO[f.campo]}: ${f.etiqueta}`).join('\n')}>+{ocultos}</span>}
        <input
          ref={entrada}
          value={texto}
          onChange={e => { setTexto(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && primera) { e.preventDefault(); agregar(primera) }
            else if (e.key === 'Backspace' && !texto && valor.length) quitar(valor.length - 1)
            else if (e.key === 'Escape') { setAbierto(false); entrada.current?.blur() }
          }}
          placeholder={valor.length ? '' : 'Filtrar por asignado, solicitante, empresa, sistema, módulo o SLA…'}
          aria-label="Filtro maestro"
          className="flex-1 min-w-15 outline-none bg-transparent text-sm placeholder:text-slate-400"
        />
        {valor.length > 0 && (
          <button type="button" aria-label="Quitar todos los filtros" title="Quitar todos los filtros"
            onClick={e => { e.stopPropagation(); onChange([]); setTexto('') }}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={14} /></button>
        )}
      </div>

      {abierto && (
        <div className="absolute z-40 left-0 right-0 mt-1.5 max-h-80 overflow-auto rounded-xl border-2 border-slate-300 bg-white p-1.5 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.22)]">
          {grupos.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-slate-500">Sin coincidencias</p>
          ) : grupos.map(g => (
            <div key={g.campo} className="py-1">
              <p className="px-2.5 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{g.titulo}</p>
              {g.lista.map(o => (
                <button key={o.campo + o.valor} type="button" onClick={() => agregar(o)}
                  className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left text-[13px] text-slate-700 hover:bg-[#1a4fa0]/10
                    ${o === primera ? 'bg-[#1a4fa0]/5' : ''}`}>
                  <span className="truncate">{o.etiqueta}</span>
                  <span className="shrink-0 text-[11.5px] text-slate-400 tabular-nums">{o.n}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Descarga a Excel de lo filtrado ─────────────────────────────────────────
const TIPO: Record<string, string> = { incidente: 'Incidente', solicitud_acceso: 'Solicitud de acceso', control_cambio: 'Control de cambios' }
const fecha = (iso?: string | null) => (iso
  ? new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  : '')

export async function descargarTicketsExcel(tickets: any[], ctx: {
  sistemas: Catalogo; modulos: Catalogo; severidad: (t: any) => string; estatus: (t: any) => string
}) {
  const XLSX = await import('xlsx')
  const nomSis = new Map(ctx.sistemas.map(s => [String(s.id), s.name]))
  const nomMod = new Map(ctx.modulos.map(m => [String(m.id), m.name]))
  const filas = tickets.map(t => ({
    'Folio': t.folio,
    'Tipo': TIPO[t.ticket_type ?? (t.folio?.startsWith('CDC-') ? 'control_cambio' : 'incidente')] ?? t.ticket_type,
    'Título': t.title,
    'Estatus': ctx.estatus(t),
    'Severidad': ctx.severidad(t),
    'Sistema': nomSis.get(String(t.system_id)) ?? '',
    'Módulo': nomMod.get(String(t.module_id)) ?? '',
    'Empresa': t.requester_company_name ?? '',
    'Solicitante': t.requester_name ?? '',
    'Asignado a': t.assigned_to_name ?? (t.assigned_to_user_id ? '' : 'Sin asignar'),
    'Creado': fecha(t.created_at),
    'Límite de respuesta': fecha(t.sla_response_limit),
    'Revisado': fecha(t.first_response_at),
    'SLA de respuesta': ETIQUETA_SLA[estadoSla(t.created_at, t.sla_response_limit, t.first_response_at)],
    'Límite de resolución': fecha(t.sla_resolution_limit),
    'Resuelto': fecha(t.resolved_at ?? t.closed_at),
    'SLA de resolución': ETIQUETA_SLA[slaResolucion(t)],
  }))
  const hoja = XLSX.utils.json_to_sheet(filas)
  hoja['!cols'] = Object.keys(filas[0] ?? { Folio: '' }).map(k => ({ wch: Math.min(48, Math.max(k.length + 2, ...filas.map(f => String((f as any)[k] ?? '').length + 1))) }))
  hoja['!autofilter'] = { ref: hoja['!ref'] ?? 'A1' }
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Tickets')
  const d = new Date(), dd = (n: number) => String(n).padStart(2, '0')
  XLSX.writeFile(libro, `tickets_${d.getFullYear()}${dd(d.getMonth() + 1)}${dd(d.getDate())}_${dd(d.getHours())}${dd(d.getMinutes())}.xlsx`)
}
