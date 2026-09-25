'use client'

import { memo, useState } from 'react'
import { Eye, UserPlus, Clock } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  en_backlog: 'En backlog', asignado: 'Asignado', en_atencion: 'En atención',
  escalado: 'Escalado', resuelto: 'Resuelto', cerrado: 'Cerrado',
}
const STATUS_CLASS: Record<string, string> = {
  en_backlog: 'bg-slate-500/[0.12] text-slate-600',
  asignado: 'bg-blue-500/[0.12] text-blue-700',
  en_atencion: 'bg-[#7c2d12]/[0.10] text-[#7c2d12]',
  escalado: 'bg-red-500/[0.12] text-red-700',
  resuelto: 'bg-emerald-500/[0.14] text-emerald-700',
  cerrado: 'bg-slate-500/[0.14] text-slate-600',
}
const STATUS_DOT: Record<string, string> = {
  en_backlog: 'bg-slate-400',
  asignado: 'bg-blue-500',
  en_atencion: 'bg-[#7c2d12]',
  escalado: 'bg-red-500',
  resuelto: 'bg-emerald-500',
  cerrado: 'bg-slate-400',
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

function SlaClock({ limit, status }: { limit: string; status: string }) {
  const [show, setShow] = useState(false)
  if (['resuelto', 'cerrado'].includes(status)) return null
  const overdue = new Date(limit) < new Date()
  return (
    <span className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Clock size={22} className={overdue ? 'text-red-500' : 'text-emerald-500'} />
      {show && (
        <div className={`absolute z-20 right-0 top-full mt-1.5 w-52 rounded-lg shadow-lg px-3 py-2 text-left text-xs font-medium text-white ${overdue ? 'bg-red-600' : 'bg-emerald-600'}`}>
          <p className="font-bold uppercase tracking-wide text-[10px] mb-1">{overdue ? 'SLA vencido' : 'SLA a tiempo'}</p>
          <p>Límite de resolución:</p>
          <p className="font-mono">{new Date(limit).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      )}
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
        {sev && <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${SEV_CLASS[sev.code] ?? ''}`}>{sev.code}</span>}
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
        {t.sla_resolution_limit && <SlaClock limit={t.sla_resolution_limit} status={t.status} />}
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {canAssign && t.status === 'en_backlog' && (
            <button
              onClick={(e) => { e.stopPropagation(); onAssign({ id: t.id, folio: t.folio }) }}
              title="Asignar"
              className="p-1.5 rounded-lg text-[#7c2d12] hover:bg-[#7c2d12]/10 transition"
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
