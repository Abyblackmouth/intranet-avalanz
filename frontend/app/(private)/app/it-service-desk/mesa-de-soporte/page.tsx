'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import PageWrapper from '@/components/layout/PageWrapper'
import { getIncidents, getSystems, getSeverities, getSpecialists, createSpecialist, updateSpecialist, exportIncidentsExcel } from '@/services/itServiceDeskService'
import { Search, Eye, Plus, UserPlus, Clock, Download } from 'lucide-react'
import CreateIncidentModal from '@/components/app/it-service-desk/mesa-de-soporte/CreateIncidentModal'
import IncidentDetailModal from '@/components/app/it-service-desk/mesa-de-soporte/IncidentDetailModal'
import AssignIncidentModal from '@/components/app/it-service-desk/mesa-de-soporte/AssignIncidentModal'
import KanbanBoard from '@/components/app/it-service-desk/mesa-de-soporte/KanbanBoard'
import { LayoutGrid, List } from 'lucide-react'
import TicketRow from '@/components/app/it-service-desk/mesa-de-soporte/TicketRow'
import NewTicketTypeModal from '@/components/app/it-service-desk/mesa-de-soporte/NewTicketTypeModal'
import CreateControlCambioModal from '@/components/app/it-service-desk/mesa-de-soporte/CreateControlCambioModal'
import { useWSEvent } from '@/hooks/useWebSocket'

interface IncidentRow {
  id: string; folio: string; title: string; status: string
  system_id: string; severity_reported_id: string; severity_validated_id: string | null
  assigned_to_user_id: string | null; assigned_to_name: string | null
  requester_name: string; requester_company_name: string
  created_at: string; is_sla_breached: boolean
  sla_response_limit: string | null; sla_resolution_limit: string | null
}
interface CatalogItem { id: string; name: string }
interface SeverityItem { id: string; code: string; name: string }

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

export default function MesaDeSoportePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const roles: string[] = user?.roles ?? []
  const isIncidentManager = roles.includes('it-service-desk:incident-manager') || roles.includes('super_admin')
  const isEspecialistaFuncional = roles.includes('it-service-desk:especialista-funcional')
  const isEspecialistaTecnico = roles.includes('it-service-desk:especialista-tecnico')
  const canAssign = isIncidentManager || isEspecialistaFuncional || isEspecialistaTecnico

  const [myFuncionalRow, setMyFuncionalRow] = useState<{ id: string; is_active: boolean } | null>(null)
  const [myTecnicoRow, setMyTecnicoRow] = useState<{ id: string; is_active: boolean } | null>(null)
  const [myProjectManagerRow, setMyProjectManagerRow] = useState<{ id: string; is_active: boolean } | null>(null)
  const [togglingTeam, setTogglingTeam] = useState<string | null>(null)
  const [exportingExcel, setExportingExcel] = useState(false)

  const fetchMySpecialistStatus = useCallback(async () => {
    if (!isIncidentManager || !user?.user_id) return
    try {
      const res = await getSpecialists()
      const rows: any[] = res.data?.data ?? []
      const mine = rows.filter(r => r.specialist_user_id === user.user_id && !r.system_id && !r.module_id)
      setMyFuncionalRow(mine.find(r => r.team_type === 'especialista-funcional') ?? null)
      setMyTecnicoRow(mine.find(r => r.team_type === 'especialista-tecnico') ?? null)
      setMyProjectManagerRow(mine.find(r => r.team_type === 'project-manager') ?? null)
    } catch {
      // silencioso -- el panel simplemente no mostrara estado activo
    }
  }, [isIncidentManager, user?.user_id])

  const handleExportExcel = async () => {
    setExportingExcel(true)
    try {
      const res = await exportIncidentsExcel()
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `concentrado_incidencias_${new Date().toISOString().slice(0, 10)}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('No se pudo generar el reporte')
    } finally {
      setExportingExcel(false)
    }
  }

  const handleToggleSpecialist = async (team: 'especialista-funcional' | 'especialista-tecnico' | 'project-manager') => {
    if (!user?.user_id) return
    setTogglingTeam(team)
    const currentRow = team === 'especialista-funcional' ? myFuncionalRow : team === 'especialista-tecnico' ? myTecnicoRow : myProjectManagerRow
    try {
      if (currentRow) {
        // Reutiliza el mismo renglon (exista activo o no) -- solo voltea is_active,
        // en vez de crear uno nuevo y dejar el anterior huerfano en la tabla.
        await updateSpecialist(currentRow.id, {
          system_id: null, module_id: null, team_type: team,
          specialist_user_id: user.user_id, is_active: !currentRow.is_active,
        })
      } else {
        await createSpecialist({
          system_id: null, module_id: null, team_type: team,
          specialist_user_id: user.user_id, is_active: true,
        })
      }
      await fetchMySpecialistStatus()
    } finally {
      setTogglingTeam(null)
    }
  }

  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [newTicketIds, setNewTicketIds] = useState<Set<string>>(new Set())

  // Tiempo real: cuando alguien crea un ticket, aparece solo en la tabla
  // sin recargar. Solo se agrega la fila nueva -- las demas (memorizadas
  // en TicketRow) no se vuelven a dibujar.
  useWSEvent('it_service_desk.ticket_created', (data: IncidentRow) => {
    setIncidents(prev => {
      if (prev.some(i => i.id === data.id)) return prev
      return [data, ...prev]
    })
    setNewTicketIds(prev => new Set(prev).add(data.id))
    setTimeout(() => {
      setNewTicketIds(prev => {
        const next = new Set(prev)
        next.delete(data.id)
        return next
      })
    }, 4000)
  })

  // Cuando cambia estatus/asignacion/severidad de un ticket ya existente
  // (resolver, reasignar, escalar, etc.), se reemplaza solo ESE elemento
  // del arreglo -- las demas filas conservan su misma referencia, asi
  // que TicketRow (memorizado) las sigue saltando.
  useWSEvent('it_service_desk.ticket_updated', (data: IncidentRow) => {
    // Si el ticket llega antes que su propio evento de "creado" (la
    // asignacion automatica puede correr antes de que termine de
    // crearse, dentro de la misma peticion), no lo ignoramos -- lo
    // agregamos igual, ya con los datos mas recientes.
    setIncidents(prev => {
      const existe = prev.some(i => i.id === data.id)
      if (!existe) return [data, ...prev]
      return prev.map(i => (i.id === data.id ? data : i))
    })
  })
  const [systems, setSystems] = useState<CatalogItem[]>([])
  const [severities, setSeverities] = useState<SeverityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [activeSevs, setActiveSevs] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showCreateCDC, setShowCreateCDC] = useState(false)
  const [assigningTicket, setAssigningTicket] = useState<{ id: string; folio: string } | null>(null)
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'tabla' | 'tablero'>('tabla')
  const [page, setPage] = useState(1)
  const PER_PAGE = 11

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [incRes, sysRes, sevRes] = await Promise.all([
        getIncidents(), getSystems(), getSeverities(),
      ])
      setIncidents(incRes.data?.data ?? [])
      setSystems(sysRes.data?.data ?? [])
      setSeverities(sevRes.data?.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchMySpecialistStatus() }, [fetchMySpecialistStatus])

  const systemName = (id: string) => systems.find(s => s.id === id)?.name ?? '—'
  const sevInfo = (id: string) => severities.find(s => s.id === id)

  const filtered = incidents.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q || t.folio.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
    const matchStatus = !statusFilter || t.status === statusFilter
    const sev = sevInfo(t.severity_validated_id ?? t.severity_reported_id)
    const matchSev = activeSevs.length === 0 || (sev && activeSevs.includes(sev.code))
    return matchSearch && matchStatus && matchSev
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <PageWrapper
      title="Mesa de Soporte"
      description="Tickets de soporte técnico y funcional"
      actions={
        <button
          onClick={() => setShowTypePicker(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[#7c2d12] rounded-lg hover:bg-[#6b2610] transition"
        >
          <Plus size={15} /> Nuevo ticket
        </button>
      }
    >
      <div className="flex flex-col h-full">
      {isIncidentManager && (
        <div className="flex items-center gap-3 mb-1 px-1 sticky top-0 z-10 bg-white py-0.5 shrink-0">
          <span className="text-xs font-medium text-slate-500">Activarme como especialista general:</span>
          <button
            onClick={() => handleToggleSpecialist('especialista-funcional')}
            disabled={togglingTeam === 'especialista-funcional'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
              myFuncionalRow?.is_active ? 'bg-[#7c2d12] text-white border-[#7c2d12]' : 'bg-white text-slate-600 border-slate-300'
            }`}
          >
            {togglingTeam === 'especialista-funcional' ? '...' : `Especialista Funcional: ${myFuncionalRow?.is_active ? 'Activo' : 'Inactivo'}`}
          </button>
          <button
            onClick={() => handleToggleSpecialist('especialista-tecnico')}
            disabled={togglingTeam === 'especialista-tecnico'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
              myTecnicoRow?.is_active ? 'bg-[#7c2d12] text-white border-[#7c2d12]' : 'bg-white text-slate-600 border-slate-300'
            }`}
          >
            {togglingTeam === 'especialista-tecnico' ? '...' : `Especialista Tecnico: ${myTecnicoRow?.is_active ? 'Activo' : 'Inactivo'}`}
          </button>
          <button
            onClick={() => handleToggleSpecialist('project-manager')}
            disabled={togglingTeam === 'project-manager'}
            title="Respaldo para Control de Cambios si no hay Project Manager disponible"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
              myProjectManagerRow?.is_active ? 'bg-[#1a4fa0] text-white border-[#1a4fa0]' : 'bg-white text-slate-600 border-slate-300'
            }`}
          >
            {togglingTeam === 'project-manager' ? '...' : `Project Manager: ${myProjectManagerRow?.is_active ? 'Activo' : 'Inactivo'}`}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="ml-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: "#217346" }}
          >
            <Download size={13} />
            {exportingExcel ? 'Generando...' : 'Exportar Excel'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-1.5 shrink-0">
        <button
          onClick={() => setViewMode('tabla')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'tabla' ? 'bg-[#7c2d12] text-white' : 'bg-white text-slate-500 border border-slate-300'}`}
        >
          <List size={13} /> Tabla
        </button>
        <button
          onClick={() => setViewMode('tablero')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'tablero' ? 'bg-[#7c2d12] text-white' : 'bg-white text-slate-500 border border-slate-300'}`}
        >
          <LayoutGrid size={13} /> Tablero
        </button>
      </div>

      {viewMode === 'tablero' && (
        <div className="flex-1 min-h-0">
          <KanbanBoard onChanged={fetchAll} />
        </div>
      )}

      {viewMode === 'tabla' && (
      <div className="bg-white rounded-2xl border border-slate-400 shadow-xl overflow-hidden relative flex flex-col flex-1 min-h-0">
                <div className="p-4 border-b border-slate-200 bg-slate-50/80 pt-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Buscar por folio o título..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:border-[#7c2d12] focus:ring-2 focus:ring-[#7c2d12]/20"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:border-[#7c2d12]"
            >
              <option value="">Todos los estatus</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <span className="text-[11px] font-medium text-slate-500 mr-1">Severidad:</span>
            {['S1', 'S2', 'S3', 'S4'].map(code => (
              <button
                key={code}
                onClick={() => { setActiveSevs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]); setPage(1) }}
                className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition ${
                  activeSevs.includes(code)
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {code}
              </button>
            ))}
            <span className="text-[11px] text-slate-400 font-mono ml-auto">{filtered.length} de {incidents.length} tickets</span>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto" style={{ flex: 1 }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-300">
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Sistema</th>
                <th className="px-4 py-3">Severidad</th>
                <th className="px-4 py-3">Estatus</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Asignado a</th>
                <th className="px-4 py-3">Creado</th>
                <th className="px-4 py-3 text-center">SLA</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-500/10">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">Sin tickets que coincidan</td></tr>
              ) : (
                paginated.map(t => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    systems={systems}
                    severities={severities}
                    canAssign={canAssign}
                    onAssign={setAssigningTicket}
                    onView={setViewingTicketId}
                    isNew={newTicketIds.has(t.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-300 bg-slate-50 shrink-0">
            <p className="text-xs text-slate-500">
              Mostrando {(page - 1) * PER_PAGE + 1}-{Math.min(page * PER_PAGE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition"
              >
                Anterior
              </button>
              <span className="text-xs text-slate-500 px-2">Página {page} de {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition"
              >
                Siguiente
              </button>
            </div>
          </div>
      </div>
      )}
      </div>

      {showTypePicker && (
        <NewTicketTypeModal
          onClose={() => setShowTypePicker(false)}
          onSelect={(type) => {
            setShowTypePicker(false)
            if (type === 'incidente') setShowCreate(true)
            if (type === 'control_cambio') setShowCreateCDC(true)
          }}
        />
      )}

      {showCreate && (
        <CreateIncidentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchAll() }}
        />
      )}

      {showCreateCDC && (
        <CreateControlCambioModal
          onClose={() => setShowCreateCDC(false)}
          onCreated={() => { setShowCreateCDC(false); fetchAll() }}
        />
      )}

      {assigningTicket && (
        <AssignIncidentModal
          incidentId={assigningTicket.id}
          folio={assigningTicket.folio}
          onClose={() => setAssigningTicket(null)}
          onAssigned={() => { setAssigningTicket(null); fetchAll() }}
        />
      )}

      {viewingTicketId && (
        <IncidentDetailModal
          incidentId={viewingTicketId}
          onClose={() => setViewingTicketId(null)}
          onChanged={fetchAll}
        />
      )}
    </PageWrapper>
  )
}
