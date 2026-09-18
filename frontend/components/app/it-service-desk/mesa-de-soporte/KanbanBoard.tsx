'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent,
} from '@dnd-kit/core'
import { useAuthStore } from '@/store/authStore'
import { getIncidents, getSeverities, closeIncident } from '@/services/itServiceDeskService'
import { Building2, GripVertical, AlertTriangle, ChevronsRight } from 'lucide-react'
import AssignIncidentModal from './AssignIncidentModal'
import ResolveIncidentModal from './ResolveIncidentModal'
import ReopenIncidentModal from './ReopenIncidentModal'

interface KanbanTicket {
  id: string; folio: string; title: string; status: string
  severity_reported_id: string; severity_validated_id: string | null
  requester_name: string; requester_company_name: string
  assigned_to_name: string | null
  sla_resolution_limit: string | null
  created_at: string
}

const COLUMNS = [
  { key: 'en_backlog', label: 'Backlog', accent: '#94a3b8' },
  { key: 'asignado', label: 'Asignado', accent: '#1a4fa0' },
  { key: 'resuelto', label: 'Resuelto', accent: '#059669' },
  { key: 'cerrado', label: 'Cerrado', accent: '#475569' },
]

const ALLOWED: Record<string, string[]> = {
  en_backlog: ['asignado'],
  asignado: ['resuelto'],
  resuelto: ['cerrado', 'asignado'],
  cerrado: [],
}

const PAGE_SIZE = 8
const SEV_CLASS: Record<string, string> = {
  S1: 'bg-red-50 text-red-700 border-red-200',
  S2: 'bg-orange-50 text-orange-700 border-orange-200',
  S3: 'bg-amber-50 text-amber-700 border-amber-200',
  S4: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function TicketCard({ ticket, severities, unlocked, onDoubleClick, dragHandleProps }: {
  ticket: KanbanTicket
  severities: { id: string; code: string; name: string }[]
  unlocked: boolean
  onDoubleClick: () => void
  dragHandleProps: any
}) {
  const sev = severities.find(s => s.id === (ticket.severity_validated_id ?? ticket.severity_reported_id))
  const overdue = ticket.sla_resolution_limit && !['resuelto', 'cerrado'].includes(ticket.status) && new Date(ticket.sla_resolution_limit) < new Date()

  return (
    <div
      onDoubleClick={onDoubleClick}
      {...(unlocked ? dragHandleProps : {})}
      className={`bg-white rounded-xl border p-3.5 transition select-none h-[150px] flex flex-col ${
        unlocked ? 'border-[#7c2d12] ring-2 ring-[#7c2d12]/20 cursor-move shadow-md' : 'border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-mono text-slate-400 truncate">{ticket.folio}</p>
        <div className="flex items-center gap-1 shrink-0">
          {unlocked && <GripVertical size={13} className="text-[#7c2d12]" />}
          {sev && <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${SEV_CLASS[sev.code] ?? ''}`}>{sev.code}</span>}
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-800 leading-snug mb-2 line-clamp-2 flex-1 overflow-hidden">{ticket.title}</p>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1 truncate">
        <Building2 size={11} className="shrink-0" /> <span className="truncate">{ticket.requester_company_name}</span>
      </div>
      {ticket.assigned_to_name && (
        <p className="text-[11px] text-slate-500 truncate mb-1">→ {ticket.assigned_to_name}</p>
      )}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">{fmtShort(ticket.created_at)}</span>
        {overdue && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600">
            <AlertTriangle size={11} /> Vencido
          </span>
        )}
      </div>
    </div>
  )
}

function DraggableCard(props: {
  ticket: KanbanTicket
  severities: { id: string; code: string; name: string }[]
  canDrag: boolean
}) {
  const { ticket, severities, canDrag } = props
  const [unlocked, setUnlocked] = useState(false)
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
    disabled: !unlocked,
  })

  const handleDoubleClick = () => {
    if (!canDrag) return
    setUnlocked(true)
    if (unlockTimer.current) clearTimeout(unlockTimer.current)
    unlockTimer.current = setTimeout(() => setUnlocked(false), 6000)
  }

  useEffect(() => {
    if (isDragging && unlockTimer.current) clearTimeout(unlockTimer.current)
  }, [isDragging])

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.3 : 1 }}>
      <TicketCard
        ticket={ticket}
        severities={severities}
        unlocked={unlocked}
        onDoubleClick={handleDoubleClick}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

function Column({ colKey, label, accent, tickets, severities, total, page, loadingMore, onLoadMore, canDrag, isExpanded, isCollapsed, onToggleExpand }: {
  colKey: string; label: string; accent: string
  tickets: KanbanTicket[]; severities: { id: string; code: string; name: string }[]
  total: number; page: number; loadingMore: boolean; onLoadMore: () => void; canDrag: boolean
  isExpanded: boolean; isCollapsed: boolean; onToggleExpand: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey })
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    setEntering(true)
    const t = setTimeout(() => setEntering(false), 20)
    return () => clearTimeout(t)
  }, [page, tickets])

  if (isCollapsed) {
    return (
      <button
        onClick={onToggleExpand}
        className="flex flex-col items-center justify-between w-11 shrink-0 bg-slate-50 hover:bg-slate-100 rounded-2xl py-4 transition group h-full"
        title={`Ver ${label}`}
      >
        <span className="w-2 h-2 rounded-full mb-2" style={{ backgroundColor: accent }} />
        <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-700 uppercase tracking-wide [writing-mode:vertical-rl] rotate-180">
          {label}
        </span>
        <span className="text-[10px] text-slate-400 mt-2">{total}</span>
        <ChevronsRight size={13} className="text-slate-300 group-hover:text-slate-500 mt-2" />
      </button>
    )
  }

  return (
    <div className={`flex flex-col h-full transition-all ${isExpanded ? 'flex-[2]' : 'flex-1'} min-w-0`}>
      <button onClick={onToggleExpand} className="flex items-center gap-2 mb-2 px-1 group shrink-0">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600 group-hover:text-[#7c2d12] transition">{label}</p>
        <span className="text-[11px] text-slate-400 ml-auto">{total}</span>
      </button>
      <div ref={setNodeRef} className={`flex-1 min-h-0 flex flex-col rounded-2xl p-2.5 transition ${isOver ? 'bg-[#7c2d12]/5 ring-2 ring-[#7c2d12]/20' : 'bg-slate-50'}`}>
        {tickets.length === 0 ? (
          <p className="text-xs text-slate-300 italic text-center py-8">Sin tickets</p>
        ) : (
          <div
            key={page}
            className={`grid gap-2.5 transition-all duration-300 ease-out ${isExpanded ? 'grid-cols-3' : 'grid-cols-2'} ${
              entering ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'
            }`}
          >
            {tickets.map(t => <DraggableCard key={t.id} ticket={t} severities={severities} canDrag={canDrag} />)}
          </div>
        )}
        {total > PAGE_SIZE && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full py-2 mt-auto text-xs font-medium text-slate-500 hover:text-[#7c2d12] transition disabled:opacity-50 shrink-0"
          >
            {loadingMore ? 'Cargando...' : (page + 1) * PAGE_SIZE < total ? `Ver más (${total - (page + 1) * PAGE_SIZE})` : 'Ver primeros'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function KanbanBoard({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuthStore()
  const roles: string[] = user?.roles ?? []
  const canDrag = roles.includes('it-service-desk:incident-manager') || roles.includes('super_admin')

  const [columnsData, setColumnsData] = useState<Record<string, { tickets: KanbanTicket[]; total: number }>>({})
  const [pages, setPages] = useState<Record<string, number>>({})
  const [loadingMore, setLoadingMore] = useState<string | null>(null)
  const [severities, setSeverities] = useState<{ id: string; code: string; name: string }[]>([])
  const [activeTicket, setActiveTicket] = useState<KanbanTicket | null>(null)
  const [pendingAction, setPendingAction] = useState<{ type: string; ticket: KanbanTicket } | null>(null)
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null)
  const [expandedCol, setExpandedCol] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchColumn = useCallback(async (colKey: string, page: number) => {
    const res = await getIncidents({ status: colKey, order: 'asc', limit: PAGE_SIZE, offset: page * PAGE_SIZE })
    setColumnsData(prev => ({ ...prev, [colKey]: { tickets: res.data.data, total: res.data.total_count } }))
  }, [])

  const fetchAll = useCallback(() => {
    COLUMNS.forEach(c => fetchColumn(c.key, pages[c.key] ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchColumn])

  useEffect(() => {
    fetchAll()
    getSeverities().then(res => setSeverities(res.data.data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!blockedMsg) return
    const t = setTimeout(() => setBlockedMsg(null), 3500)
    return () => clearTimeout(t)
  }, [blockedMsg])

  const handleLoadMore = async (colKey: string) => {
    const total = columnsData[colKey]?.total ?? 0
    const current = pages[colKey] ?? 0
    const nextPage = (current + 1) * PAGE_SIZE < total ? current + 1 : 0
    setLoadingMore(colKey)
    setPages(prev => ({ ...prev, [colKey]: nextPage }))
    await fetchColumn(colKey, nextPage)
    setLoadingMore(null)
  }

  const handleDragStart = (e: DragStartEvent) => {
    setActiveTicket(e.active.data.current?.ticket ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTicket(null)
    const ticket: KanbanTicket | undefined = e.active.data.current?.ticket
    const destination = e.over?.id as string | undefined
    if (!ticket || !destination || destination === ticket.status) return

    const allowed = ALLOWED[ticket.status] ?? []
    if (!allowed.includes(destination)) {
      setBlockedMsg('No puedes saltarte fases — solo se avanza un paso a la vez')
      return
    }

    if (ticket.status === 'en_backlog' && destination === 'asignado') {
      setPendingAction({ type: 'asignar', ticket })
    } else if (ticket.status === 'asignado' && destination === 'resuelto') {
      setPendingAction({ type: 'resolver', ticket })
    } else if (ticket.status === 'resuelto' && destination === 'asignado') {
      setPendingAction({ type: 'reabrir', ticket })
    } else if (ticket.status === 'resuelto' && destination === 'cerrado') {
      if (confirm(`¿Confirmas cerrar formalmente el ticket ${ticket.folio}?`)) {
        closeIncident(ticket.id).then(() => { fetchAll(); onChanged?.() })
      }
    }
  }

  const refreshAfterAction = () => {
    setPendingAction(null)
    fetchAll()
    onChanged?.()
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <div className="flex flex-col h-full">
      {!canDrag && (
        <p className="text-xs text-slate-400 mb-2 px-1 shrink-0">Solo Incident Manager puede mover tickets entre columnas.</p>
      )}
      {canDrag && (
        <p className="text-xs text-slate-400 mb-2 px-1 shrink-0">Doble clic en una tarjeta para desbloquearla, luego arrástrala a la siguiente fase. Clic en el nombre de una fase para verla más grande.</p>
      )}
      {blockedMsg && (
        <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2 shrink-0">
          <AlertTriangle size={13} /> {blockedMsg}
        </div>
      )}
      <div className="border border-slate-300 rounded-2xl bg-white shadow-sm p-4 w-full h-full overflow-x-auto flex flex-col">
        <div className="flex gap-3 flex-1 min-h-0">
          {COLUMNS.map(col => (
            <Column
              key={col.key}
              colKey={col.key}
              label={col.label}
              accent={col.accent}
              tickets={columnsData[col.key]?.tickets ?? []}
              total={columnsData[col.key]?.total ?? 0}
              page={pages[col.key] ?? 0}
              severities={severities}
              loadingMore={loadingMore === col.key}
              onLoadMore={() => handleLoadMore(col.key)}
              canDrag={canDrag}
              isExpanded={expandedCol === col.key}
              isCollapsed={expandedCol !== null && expandedCol !== col.key}
              onToggleExpand={() => setExpandedCol(prev => (prev === col.key ? null : col.key))}
            />
          ))}
        </div>
      </div>
    </div>

      <DragOverlay>
        {activeTicket && (
          <div className="w-52 opacity-90">
            <TicketCard ticket={activeTicket} severities={severities} unlocked onDoubleClick={() => {}} dragHandleProps={{}} />
          </div>
        )}
      </DragOverlay>

      {pendingAction?.type === 'asignar' && (
        <AssignIncidentModal
          incidentId={pendingAction.ticket.id}
          folio={pendingAction.ticket.folio}
          onClose={() => setPendingAction(null)}
          onAssigned={refreshAfterAction}
        />
      )}
      {pendingAction?.type === 'resolver' && (
        <ResolveIncidentModal
          incidentId={pendingAction.ticket.id}
          folio={pendingAction.ticket.folio}
          onClose={() => setPendingAction(null)}
          onResolved={refreshAfterAction}
        />
      )}
      {pendingAction?.type === 'reabrir' && (
        <ReopenIncidentModal
          incidentId={pendingAction.ticket.id}
          folio={pendingAction.ticket.folio}
          onClose={() => setPendingAction(null)}
          onReopened={refreshAfterAction}
        />
      )}
    </DndContext>
  )
}
