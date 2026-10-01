'use client'

import { memo, useState } from 'react'
import { Eye, UserPlus, Clock, CheckCircle2 } from 'lucide-react'

// Prioridad de CDC (definida por el PM al priorizar). Letra P para no
// confundirse con las S1-S4 de severidad de Incidente.
export const PRIO_CODE: Record<string, string> = { alta: 'P1', media: 'P2', baja: 'P3' }
export const PRIO_CLASS: Record<string, string> = {
  alta: 'bg-red-500/[0.12] text-red-700',
  media: 'bg-amber-500/[0.14] text-amber-700',
  baja: 'bg-sky-500/[0.14] text-sky-700',
}

const STATUS_LABEL: Record<string, string> = {
  en_backlog: 'En backlog', asignado: 'Asignado', en_atencion: 'En atención',
  escalado: 'Escalado', resuelto: 'Resuelto', cerrado: 'Cerrado',
  registrado: 'Registrado', en_revision: 'En revisión', aprobado: 'Aprobado',
  rechazado: 'Rechazado', priorizado: 'Priorizado', en_desarrollo: 'En desarrollo',
  en_pruebas: 'En pruebas (UAT)', terminado: 'Terminado', cancelado: 'Cancelado',
}
export const STATUS_CLASS: Record<string, string> = {
  en_backlog: 'bg-slate-500/[0.12] text-slate-600',
  asignado: 'bg-blue-500/[0.12] text-blue-700',
  en_atencion: 'bg-[#1a4fa0]/[0.10] text-[#1a4fa0]',
  escalado: 'bg-red-500/[0.12] text-red-700',
  resuelto: 'bg-emerald-500/[0.14] text-emerald-700',
  cerrado: 'bg-slate-500/[0.14] text-slate-600',
  registrado: 'bg-slate-500/[0.12] text-slate-600',
  en_revision: 'bg-blue-500/[0.12] text-blue-700',
  aprobado: 'bg-emerald-500/[0.12] text-emerald-700',
  rechazado: 'bg-red-500/[0.12] text-red-700',
  priorizado: 'bg-indigo-500/[0.12] text-indigo-700',
  en_desarrollo: 'bg-amber-500/[0.14] text-amber-700',
  en_pruebas: 'bg-orange-500/[0.12] text-orange-700',
  terminado: 'bg-teal-600/[0.14] text-teal-800',
  cancelado: 'bg-slate-600/[0.14] text-slate-700',
}
const STATUS_DOT: Record<string, string> = {
  en_backlog: 'bg-slate-400',
  asignado: 'bg-blue-500',
  en_atencion: 'bg-[#1a4fa0]',
  escalado: 'bg-red-500',
  resuelto: 'bg-emerald-500',
  cerrado: 'bg-slate-400',
  registrado: 'bg-slate-400',
  en_revision: 'bg-blue-500',
  aprobado: 'bg-emerald-500',
  rechazado: 'bg-red-500',
  priorizado: 'bg-indigo-500',
  en_desarrollo: 'bg-amber-500',
  en_pruebas: 'bg-orange-500',
  terminado: 'bg-teal-600',
  cancelado: 'bg-slate-500',
}
const SEV_CLASS: Record<string, string> = {
  S1: 'bg-red-500/[0.10] text-red-700 border border-red-500/25',
  S2: 'bg-orange-500/[0.12] text-orange-700 border border-orange-500/25',
  S3: 'bg-amber-500/[0.12] text-amber-700 border border-amber-500/25',
  S4: 'bg-emerald-500/[0.12] text-emerald-700 border border-emerald-500/25',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function SlaReloj({ tipo, letra, inicio, limite, cumplido }: {
  tipo: 'Respuesta' | 'Resolución'; letra: string; inicio: string; limite?: string | null; cumplido?: string | null
}) {
  if (!limite) return <span className="inline-flex w-7 justify-center text-slate-300" title={`${tipo}: no aplica`}>—</span>
  const lim = new Date(limite).getTime(), ini = new Date(inicio).getTime(), ahora = Date.now()
  const hecho = cumplido ? new Date(cumplido).getTime() : null
  const estado = hecho !== null ? (hecho <= lim ? 'ok' : 'tarde')
    : ahora > lim ? 'vencido' : (lim - ahora) < (lim - ini) * 0.25 ? 'riesgo' : 'pend'
  const E = {
    ok:      { color: 'text-emerald-500', fondo: 'bg-emerald-600', txt: 'Cumplido a tiempo' },
    pend:    { color: 'text-emerald-500', fondo: 'bg-emerald-600', txt: 'A tiempo' },
    riesgo:  { color: 'text-amber-500',   fondo: 'bg-amber-500',   txt: 'Por vencer' },
    vencido: { color: 'text-red-500',     fondo: 'bg-red-600',     txt: 'Vencido' },
    tarde:   { color: 'text-red-500',     fondo: 'bg-red-600',     txt: 'Cumplido tarde' },
  }[estado]
  const f = (d: number) => new Date(d).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <span className="relative group inline-flex items-center gap-0.5" aria-label={`${tipo}: ${E.txt}`}>
      {hecho !== null ? <CheckCircle2 size={20} className={E.color} /> : <Clock size={20} className={E.color} />}
      <span className={`text-[9px] font-bold ${E.color}`}>{letra}</span>
      <span className={`pointer-events-none absolute right-0 top-full mt-1.5 z-30 w-max max-w-[230px] rounded-lg px-3 py-2 text-white text-[11px] text-left shadow-lg opacity-0 group-hover:opacity-100 transition ${E.fondo}`}>
        <span className="block font-bold uppercase tracking-wide text-[10px] mb-0.5">{tipo} · {E.txt}</span>
        <span className="block">Límite: <span className="font-mono">{f(lim)}</span></span>
        {hecho !== null && <span className="block">{tipo === 'Respuesta' ? 'Revisado' : 'Resuelto'}: <span className="font-mono">{f(hecho)}</span></span>}
      </span>
    </span>
  )
}

interface TicketRowProps {
  ticket: any
  systems: { id: string; name: string }[]
  severities: { id: string; code: string; name: string }[]
  canAssign: boolean
  onAssign: (t: { id: string; folio: string }) => void
  onView: (id: string) => void
  isNew?: boolean
}

// Arranque (CDC): mismos colores que Priorizado
STATUS_LABEL.en_arranque = 'Arranque'
STATUS_CLASS.en_arranque = STATUS_CLASS.priorizado ?? STATUS_CLASS.en_backlog
STATUS_DOT.en_arranque = STATUS_DOT.priorizado ?? STATUS_DOT.en_backlog
STATUS_LABEL.en_diseno_funcional = 'Diseño funcional'
STATUS_LABEL.en_diseno_tecnico = 'Diseño técnico'
STATUS_CLASS.en_diseno_funcional = STATUS_CLASS.en_diseno_tecnico = STATUS_CLASS.priorizado ?? STATUS_CLASS.en_backlog
STATUS_DOT.en_diseno_funcional = STATUS_DOT.en_diseno_tecnico = STATUS_DOT.priorizado ?? STATUS_DOT.en_backlog
STATUS_LABEL.en_paso_produccion = 'Paso a producción'
STATUS_CLASS.en_paso_produccion = STATUS_CLASS.priorizado ?? STATUS_CLASS.en_backlog
STATUS_DOT.en_paso_produccion = STATUS_DOT.priorizado ?? STATUS_DOT.en_backlog

function TicketRowInner({ ticket: t, systems, severities, canAssign, onAssign, onView, isNew }: TicketRowProps) {
  const sev = severities.find(s => s.id === (t.severity_validated_id ?? t.severity_reported_id))
  const sysName = systems.find(s => s.id === t.system_id)?.name ?? '—'

  return (
    <tr
      onClick={() => onView(t.id)}
      className="hover:bg-slate-50 transition-colors duration-[3000ms] cursor-pointer"
      style={isNew ? { backgroundColor: '#fef9c3' } : undefined}
    >
      <td className="px-4 py-2 font-mono text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[t.status] ?? 'bg-slate-300'}`} />
          {t.folio}
        </span>
      </td>
      <td className="px-4 py-2 font-medium text-slate-800 max-w-xs truncate">{t.title}</td>
      <td className="px-4 py-2 text-xs text-slate-500">{t.requester_company_name}</td>
      <td className="px-4 py-2 text-xs text-slate-500">{sysName}</td>
      <td className="px-4 py-2 text-center">
        {((t as any).ticket_type === 'control_cambio' || t.folio?.startsWith('CDC-'))
          ? ((t as any).cdc_prioridad
              ? <span title={t.status === 'rechazado' ? 'Urgencia indicada por el solicitante: el proyecto no llegó a priorización' : 'Prioridad definida por Gerencia de Proyectos'}
                  className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${PRIO_CLASS[(t as any).cdc_prioridad] ?? ''} ${t.status === 'rechazado' ? 'opacity-60' : ''}`}>{PRIO_CODE[(t as any).cdc_prioridad]}</span>
              : <span className="text-slate-300">—</span>)
          : sev && <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${SEV_CLASS[sev.code] ?? ''}`}>{sev.code}</span>}
      </td>
      <td className="px-4 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_CLASS[t.status] ?? ''}`}>
          {STATUS_LABEL[t.status] ?? t.status}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-slate-500">{t.requester_name}</td>
      <td className="px-4 py-2 text-xs text-slate-500">
        {t.assigned_to_name ?? <span className="italic text-slate-300">Sin asignar</span>}
      </td>
      <td className="px-4 py-2 text-xs text-slate-500">{fmt(t.created_at)}</td>
      <td className="px-4 py-2 text-center">
        <span className="inline-flex items-center gap-2">
          <SlaReloj tipo="Respuesta" letra="R" inicio={t.created_at} limite={(t as any).sla_response_limit} cumplido={(t as any).first_response_at} />
          <SlaReloj tipo="Resolución" letra="S" inicio={t.created_at} limite={t.sla_resolution_limit}
            cumplido={['resuelto', 'cerrado'].includes(t.status) ? ((t as any).resolved_at ?? (t as any).closed_at ?? t.sla_resolution_limit) : null} />
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {canAssign && t.status === 'en_backlog' && (
            <button
              onClick={(e) => { e.stopPropagation(); onAssign({ id: t.id, folio: t.folio }) }}
              title="Asignar"
              className="p-1.5 rounded-lg text-[#1a4fa0] hover:bg-[#1a4fa0]/10 transition"
            >
              <UserPlus size={22} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onView(t.id) }}
            title="Ver"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-500/10 transition"
          >
            <Eye size={22} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// Solo se vuelve a dibujar esta fila si SU PROPIO ticket cambio (misma
// referencia = mismos datos = React.memo la salta), no cuando cambia
// cualquier otra parte de la tabla o llega un ticket nuevo.
const TicketRow = memo(TicketRowInner, (prev, next) => {
  return prev.ticket === next.ticket && prev.isNew === next.isNew && prev.canAssign === next.canAssign
})

export default TicketRow
