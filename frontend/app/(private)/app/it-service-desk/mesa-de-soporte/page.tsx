'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import FiltroMaestro, { type FiltroMaestroItem, cumpleFiltroMaestro, descargarTicketsExcel } from '@/components/app/it-service-desk/mesa-de-soporte/FiltroMaestro'
import { Download as IconoDescarga } from 'lucide-react'
import { getModulesCatalog, getIncidents, getSystems, getSeverities, getSpecialists, createSpecialist, updateSpecialist, exportIncidentsExcel, exportCdcExcel } from '@/services/itServiceDeskService'
import { Search, Eye, Plus, UserPlus, Clock, Download } from 'lucide-react'
import CreateIncidentModal from '@/components/app/it-service-desk/mesa-de-soporte/CreateIncidentModal'
import IncidentDetailModal from '@/components/app/it-service-desk/mesa-de-soporte/IncidentDetailModal'
import CdcDetailModal from '@/components/app/it-service-desk/mesa-de-soporte/CdcDetailModal'
import CdcKanbanBoard from '@/components/app/it-service-desk/mesa-de-soporte/CdcKanbanBoard'
import AssignIncidentModal from '@/components/app/it-service-desk/mesa-de-soporte/AssignIncidentModal'
import KanbanBoard from '@/components/app/it-service-desk/mesa-de-soporte/KanbanBoard'
import { LayoutGrid, List } from 'lucide-react'
import TicketRow from '@/components/app/it-service-desk/mesa-de-soporte/TicketRow'
import NewTicketTypeModal from '@/components/app/it-service-desk/mesa-de-soporte/NewTicketTypeModal'
import CreateControlCambioModal from '@/components/app/it-service-desk/mesa-de-soporte/CreateControlCambioModal'
import CreateSolicitudAccesoModal from '@/components/app/it-service-desk/mesa-de-soporte/CreateSolicitudAccesoModal'
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
  escalado: 'Escalado', resuelto: 'Terminado', cerrado: 'Cerrado',
}
const STATUS_CLASS: Record<string, string> = {
  en_backlog: 'bg-slate-500/[0.12] text-slate-600',
  asignado: 'bg-blue-500/[0.12] text-blue-700',
  en_atencion: 'bg-[#1a4fa0]/[0.10] text-[#1a4fa0]',
  escalado: 'bg-red-500/[0.12] text-red-700',
  resuelto: 'bg-emerald-500/[0.14] text-emerald-700',
  cerrado: 'bg-slate-500/[0.14] text-slate-600',
}
const STATUS_DOT: Record<string, string> = {
  en_backlog: 'bg-slate-400',
  asignado: 'bg-blue-500',
  en_atencion: 'bg-[#1a4fa0]',
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

  const [menuExport, setMenuExport] = useState(false)
  const rolesUsuario: string[] = (user as any)?.roles ?? []
  const puedeExportarCdc = isIncidentManager || rolesUsuario.some(r =>
    ['it-service-desk:project-manager', 'it-service-desk:comite-directivo', 'super_admin'].includes(r))
  const descargar = (data: BlobPart, nombre: string) => {
    const url = window.URL.createObjectURL(new Blob([data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', nombre)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }
  const handleExportCdc = async () => {
    setExportingExcel(true); setMenuExport(false)
    try { descargar((await exportCdcExcel()).data, `seguimiento_cdc_${new Date().toISOString().slice(0, 10)}.xlsx`) }
    catch { alert('No se pudo generar el reporte de Controles de Cambio') }
    finally { setExportingExcel(false) }
  }

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
  const [maestro, setMaestro] = useState<FiltroMaestroItem[]>([])
  const [modulos, setModulos] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    getModulesCatalog().then(r => { const d: any = r.data; setModulos(Array.isArray(d) ? d : (d?.data ?? [])) }).catch(() => {})
  }, [])
  // Tipo de ticket: vacío = todos. El filtro inicial depende del rol y se aplica
  // una sola vez; después el usuario decide y el sistema no lo cambia solo.
  const [activeTypes, setActiveTypes] = useState<string[]>([])
  const [tiposIniciales, setTiposIniciales] = useState(false)
  useEffect(() => {
    if (tiposIniciales || roles.length === 0) return
    setTiposIniciales(true)
    if (isIncidentManager) setActiveTypes(['incidente', 'solicitud_acceso'])
    else if (roles.includes('it-service-desk:project-manager')) setActiveTypes(['control_cambio'])
  }, [roles, isIncidentManager, tiposIniciales])

  // Estatus de cada tipo de ticket, en el orden de su ciclo. El desplegable solo
  // ofrece los de los tipos activos (sin tipos activos = todos los tipos).
  const FLUJO_INCIDENTE: [string, string][] = [['en_backlog', 'En backlog'], ['asignado', 'Asignado'], ['en_atencion', 'En atención'],
    ['escalado', 'Escalado'], ['resuelto', 'Terminado'], ['cerrado', 'Cerrado']]
  const ESTATUS_POR_TIPO: Record<string, { label: string; estatus: [string, string][] }> = {
    incidente: { label: 'Incidentes', estatus: FLUJO_INCIDENTE },
    solicitud_acceso: { label: 'Solicitudes de acceso', estatus: FLUJO_INCIDENTE },
    control_cambio: { label: 'Control de cambios', estatus: [
      ['en_backlog', 'Registrado'], ['en_revision', 'En revisión'], ['aprobado', 'Aprobado'], ['rechazado', 'Rechazado'],
      ['priorizado', 'Priorizado'], ['en_arranque', 'Arranque'], ['en_diseno_funcional', 'Diseño funcional'],
      ['en_diseno_tecnico', 'Diseño técnico'], ['en_desarrollo', 'En desarrollo'], ['en_pruebas', 'En pruebas (UAT)'],
      ['en_paso_produccion', 'Paso a producción'], ['terminado', 'Terminado'], ['cerrado', 'Cerrado'], ['cancelado', 'Cancelado']] },
  }
  const tipoDe = (t: any): string => t.ticket_type ?? (t.folio?.startsWith('CDC-') ? 'control_cambio' : 'incidente')
  const tiposVisibles = ['incidente', 'solicitud_acceso', 'control_cambio'].filter(tp => activeTypes.length === 0 || activeTypes.includes(tp))
  const conteoEstatus = (tp: string, st: string) => incidents.filter((t: any) => tipoDe(t) === tp && t.status === st).length
  // Si se apaga el tipo del estatus elegido, se limpia el estatus
  useEffect(() => {
    if (statusFilter.includes(':') && !tiposVisibles.includes(statusFilter.split(':')[0])) setStatusFilter('')
  }, [activeTypes]) // eslint-disable-line react-hooks/exhaustive-deps
  const [showCreate, setShowCreate] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)
  // Abre el selector de nuevo ticket al llegar con ?nuevo=1 (desde el asistente)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('nuevo') === '1') setShowTypePicker(true)
  }, [])
  const [showCreateCDC, setShowCreateCDC] = useState(false)
  const [showCreateACC, setShowCreateACC] = useState(false)
  const [assigningTicket, setAssigningTicket] = useState<{ id: string; folio: string } | null>(null)
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null)
  const [viewingCdcId, setViewingCdcId] = useState<string | null>(null)
  const [cdcBoardKey, setCdcBoardKey] = useState(0)
  const [cdcClasif, setCdcClasif] = useState<'todos' | 'proyecto' | 'cambio'>('todos')
  const [cdcPrio, setCdcPrio] = useState<'todas' | 'P1' | 'P2' | 'P3'>('todas')
  const [cdcVista, setCdcVista] = useState<'etapas' | 'fases'>('fases')
  const [viewMode, setViewMode] = useState<'tabla' | 'tablero' | 'proyectos'>('tabla')
  const [page, setPage] = useState(1)
  const PER_PAGE = 13

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
    const [fTipo, fStatus] = statusFilter.includes(':') ? statusFilter.split(':') : [null, statusFilter]
    const matchStatus = !statusFilter || (t.status === fStatus && (!fTipo || tipoDe(t) === fTipo))
    const sev = sevInfo(t.severity_validated_id ?? t.severity_reported_id)
    const matchSev = activeSevs.length === 0 || (sev && activeSevs.includes(sev.code))
    const tipo = (t as any).ticket_type ?? (t.folio?.startsWith('CDC-') ? 'control_cambio' : 'incidente')
    const matchTipo = activeTypes.length === 0 || activeTypes.includes(tipo)
    return matchSearch && matchStatus && matchSev && matchTipo && cumpleFiltroMaestro(t, maestro)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    // Sin encabezado: su espacio se usa para los tableros. Es el mismo
    // contenedor que PageWrapper (que no se modifica), sin su cabecera.
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-auto px-6 max-[1440px]:px-4 pt-3 pb-6 max-[1440px]:pb-4 min-h-0">
      <div className="flex flex-col h-full">
      {/* Barra superior de la Mesa de Soporte: vista a la izquierda; disponibilidad,
          exportación y nuevo ticket a la derecha. Mismos handlers de siempre. */}
      <div className="flex items-center gap-3 mb-2 shrink-0 flex-wrap">
        <div role="tablist" aria-label="Vista" className="inline-flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-0.5">
          <button type="button" role="tab" aria-selected={viewMode === 'tabla'} onClick={() => setViewMode('tabla')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === 'tabla' ? 'bg-[#1a4fa0] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            <List size={13} /> Tabla
          </button>
          <button type="button" role="tab" aria-selected={viewMode === 'tablero'} onClick={() => setViewMode('tablero')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === 'tablero' ? 'bg-[#1a4fa0] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            <LayoutGrid size={13} /> Tablero incidentes
          </button>
          <button type="button" role="tab" aria-selected={viewMode === 'proyectos'} onClick={() => setViewMode('proyectos')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === 'proyectos' ? 'bg-[#1a4fa0] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            <LayoutGrid size={13} /> Tablero proyectos
          </button>
        </div>
        {viewMode === 'proyectos' && (
          <div className="flex items-center gap-5 ml-10">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Tipo</span>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-xs" role="group" aria-label="Tipo de proyecto">
                <button type="button" aria-pressed={cdcClasif === 'todos'} onClick={() => setCdcClasif('todos')}
                  className={`px-2.5 py-1.5 ${cdcClasif === 'todos' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Todos</button>
                <button type="button" aria-pressed={cdcClasif === 'proyecto'} onClick={() => setCdcClasif('proyecto')}
                  className={`px-2.5 py-1.5 border-l border-slate-200 ${cdcClasif === 'proyecto' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Proyecto</button>
                <button type="button" aria-pressed={cdcClasif === 'cambio'} onClick={() => setCdcClasif('cambio')}
                  className={`px-2.5 py-1.5 border-l border-slate-200 ${cdcClasif === 'cambio' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Cambio</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Prioridad</span>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-xs" role="group" aria-label="Prioridad">
                <button type="button" aria-pressed={cdcPrio === 'todas'} onClick={() => setCdcPrio('todas')}
                  className={`px-2.5 py-1.5 ${cdcPrio === 'todas' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Todas</button>
                <button type="button" aria-pressed={cdcPrio === 'P1'} onClick={() => setCdcPrio('P1')}
                  className={`px-2.5 py-1.5 border-l border-slate-200 ${cdcPrio === 'P1' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>P1</button>
                <button type="button" aria-pressed={cdcPrio === 'P2'} onClick={() => setCdcPrio('P2')}
                  className={`px-2.5 py-1.5 border-l border-slate-200 ${cdcPrio === 'P2' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>P2</button>
                <button type="button" aria-pressed={cdcPrio === 'P3'} onClick={() => setCdcPrio('P3')}
                  className={`px-2.5 py-1.5 border-l border-slate-200 ${cdcPrio === 'P3' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>P3</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Vista</span>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-xs" role="group" aria-label="Vista del tablero">
                <button type="button" aria-pressed={cdcVista === 'fases'} onClick={() => setCdcVista('fases')}
                  className={`px-2.5 py-1.5 ${cdcVista === 'fases' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Por fase</button>
                <button type="button" aria-pressed={cdcVista === 'etapas'} onClick={() => setCdcVista('etapas')}
                  className={`px-2.5 py-1.5 border-l border-slate-200 ${cdcVista === 'etapas' ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Por etapa</button>
              </div>
            </div>
          </div>
        )}

        {/* Botón principal: centrado en el espacio libre entre "ver" (izquierda) y las herramientas (derecha) */}
        <div className="flex-1 flex justify-center min-w-42.5">
          <button type="button" onClick={() => setShowTypePicker(true)}
            className="inline-flex items-center gap-2 h-9 pl-3.5 pr-5 rounded-full bg-[#1a4fa0] text-white text-[13px] font-semibold shadow-md shadow-[#1a4fa0]/25 transition hover:bg-[#153f82] hover:shadow-lg hover:shadow-[#1a4fa0]/35 hover:-translate-y-px active:translate-y-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1a4fa0]/30">
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center"><Plus size={14} strokeWidth={2.5} /></span>
            Nuevo ticket
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isIncidentManager && (
            <>
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white pl-2.5 pr-1 py-0.5">
                <span className="text-[11px] text-slate-400 mr-1">Activo como</span>
                <button type="button" onClick={() => handleToggleSpecialist('especialista-funcional')} disabled={togglingTeam === 'especialista-funcional'}
                  title="Activarme como especialista funcional general" aria-pressed={!!myFuncionalRow?.is_active}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] font-medium border transition disabled:opacity-50 ${myFuncionalRow?.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-slate-500 border-transparent hover:bg-slate-100'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${myFuncionalRow?.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {togglingTeam === 'especialista-funcional' ? '…' : 'Funcional'}
                </button>
                <button type="button" onClick={() => handleToggleSpecialist('especialista-tecnico')} disabled={togglingTeam === 'especialista-tecnico'}
                  title="Activarme como especialista técnico general" aria-pressed={!!myTecnicoRow?.is_active}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] font-medium border transition disabled:opacity-50 ${myTecnicoRow?.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-slate-500 border-transparent hover:bg-slate-100'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${myTecnicoRow?.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {togglingTeam === 'especialista-tecnico' ? '…' : 'Técnico'}
                </button>
                <button type="button" onClick={() => handleToggleSpecialist('project-manager')} disabled={togglingTeam === 'project-manager'}
                  title="Respaldo para Control de Cambios si no hay Project Manager disponible" aria-pressed={!!myProjectManagerRow?.is_active}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] font-medium border transition disabled:opacity-50 ${myProjectManagerRow?.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-slate-500 border-transparent hover:bg-slate-100'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${myProjectManagerRow?.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {togglingTeam === 'project-manager' ? '…' : 'PM'}
                </button>
              </div>
            </>
          )}
          {(isIncidentManager || puedeExportarCdc) && (() => {
            const opciones = [
              ...(isIncidentManager ? [{ key: 'inc', label: 'Incidentes', desc: 'Concentrado de incidencias', run: () => { setMenuExport(false); handleExportExcel() } }] : []),
              ...(puedeExportarCdc ? [{ key: 'cdc', label: 'Control de Cambios', desc: 'Seguimiento CC (formato Verus)', run: handleExportCdc }] : []),
            ]
            // La opción de la vista actual va primero
            if (viewMode === 'proyectos') opciones.sort(a => (a.key === 'cdc' ? -1 : 1))
            return (
              <div className="relative">
                <button type="button" disabled={exportingExcel} aria-haspopup={opciones.length > 1 ? 'menu' : undefined} aria-expanded={menuExport}
                  onClick={() => (opciones.length > 1 ? setMenuExport(v => !v) : opciones[0].run())}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50 transition disabled:opacity-50">
                  <Download size={13} /> {exportingExcel ? 'Generando…' : 'Exportar Excel'}{opciones.length > 1 && <span aria-hidden="true" className="ml-0.5">▾</span>}
                </button>
                {menuExport && opciones.length > 1 && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuExport(false)} />
                    <div role="menu" className="absolute right-0 top-full mt-1.5 z-40 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-1">
                      {opciones.map((o, i) => (
                        <button key={o.key} role="menuitem" type="button" onClick={o.run}
                          className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 ${i === 0 ? 'bg-emerald-50/60' : ''}`}>
                          <span className="block text-[13px] font-medium text-slate-800">{o.label}</span>
                          <span className="block text-[11.5px] text-slate-500">{o.desc}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {viewMode === 'tablero' && (
        <div className="flex-1 min-h-0">
          <KanbanBoard onChanged={fetchAll} />
        </div>
      )}

      {viewMode === 'proyectos' && (
        <div className="flex-1 min-h-0">
          <CdcKanbanBoard onOpen={setViewingCdcId} refreshKey={cdcBoardKey} clasif={cdcClasif} prio={cdcPrio} vista={cdcVista} />
        </div>
      )}

      {viewMode === 'tabla' && (
      <div className="bg-white rounded-2xl border border-slate-400 shadow-xl overflow-hidden relative flex flex-col flex-1 min-h-0">
                <div className="p-4 border-b border-slate-200 bg-slate-50/80 pt-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 min-w-50">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Buscar por folio o título..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/20"
              />
            </div>
            <FiltroMaestro tickets={incidents} sistemas={systems as any} modulos={modulos} valor={maestro} onChange={v => { setMaestro(v); setPage(1) }} />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:border-[#1a4fa0]"
            >
              <option value="">Todos los estatus</option>
              {tiposVisibles.length === 1
                ? ESTATUS_POR_TIPO[tiposVisibles[0]].estatus.map(([k, v]) => (
                    <option key={k} value={`${tiposVisibles[0]}:${k}`}>{v} ({conteoEstatus(tiposVisibles[0], k)})</option>
                  ))
                : tiposVisibles.map(tp => (
                    <optgroup key={tp} label={ESTATUS_POR_TIPO[tp].label}>
                      {ESTATUS_POR_TIPO[tp].estatus.map(([k, v]) => (
                        <option key={k} value={`${tp}:${k}`}>{v} ({conteoEstatus(tp, k)})</option>
                      ))}
                    </optgroup>
                  ))}
            </select>
            <button type="button" disabled={!filtered.length}
              title={`Descargar a Excel los ${filtered.length} tickets filtrados`}
              onClick={() => descargarTicketsExcel(filtered, {
                sistemas: systems as any, modulos,
                severidad: (t: any) => sevInfo(t.severity_validated_id ?? t.severity_reported_id)?.code ?? '',
                estatus: (t: any) => (ESTATUS_POR_TIPO as any)[tipoDe(t)]?.estatus.find((e: any) => e[0] === t.status)?.[1] ?? t.status,
              })}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-700 hover:border-[#1a4fa0] hover:text-[#1a4fa0] disabled:opacity-50 whitespace-nowrap">
              <IconoDescarga size={15} /> Descargar
            </button>
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
            <span className="w-px h-4 bg-slate-300 mx-2" aria-hidden="true" />
            <span className="text-[11px] font-medium text-slate-500 mr-1">Tipo:</span>
            {[['incidente', 'Incidentes'], ['solicitud_acceso', 'Solicitudes de acceso'], ['control_cambio', 'Control de cambios']].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={activeTypes.includes(key)}
                onClick={() => { setActiveTypes(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]); setPage(1) }}
                className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition ${
                  activeTypes.includes(key)
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-[11px] text-slate-400 font-mono ml-auto">{filtered.length} de {incidents.length} tickets</span>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto" style={{ flex: 1 }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-300">
                <th className="whitespace-nowrap px-4 py-3">Folio</th>
                <th className="whitespace-nowrap px-4 py-3">Título</th>
                <th className="whitespace-nowrap px-4 py-3">Empresa</th>
                <th className="whitespace-nowrap px-4 py-3">Sistema</th>
                <th className="whitespace-nowrap px-4 py-3">Severidad</th>
                <th className="whitespace-nowrap px-4 py-3">Estatus</th>
                <th className="whitespace-nowrap px-4 py-3">Solicitante</th>
                <th className="whitespace-nowrap px-4 py-3">Asignado a</th>
                <th className="whitespace-nowrap px-4 py-3">Creado</th>
                <th className="whitespace-nowrap px-4 py-3 text-center">SLA</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Acciones</th>
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

        {/* pr-20: deja libre la esquina inferior derecha para la esfera del asistente */}
        <div className="flex items-center justify-between pl-4 pr-20 py-3 border-t border-slate-300 bg-slate-50 shrink-0">
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
            if (type === 'solicitud_acceso') setShowCreateACC(true)
          }}
        />
      )}

      {showCreate && (
        <CreateIncidentModal
          onClose={() => setShowCreate(false)}
          onBack={() => { setShowCreate(false); setShowTypePicker(true) }}
          onCreated={() => { setShowCreate(false); fetchAll() }}
        />
      )}

      {showCreateACC && (
        <CreateSolicitudAccesoModal
          onClose={() => setShowCreateACC(false)}
          onBack={() => { setShowCreateACC(false); setShowTypePicker(true) }}
          onCreated={() => { setShowCreateACC(false); fetchAll() }}
        />
      )}
      {showCreateCDC && (
        <CreateControlCambioModal
          onClose={() => setShowCreateCDC(false)}
          onBack={() => { setShowCreateCDC(false); setShowTypePicker(true) }}
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

      {viewingTicketId && (() => {
        // CDC abre su propio detalle por etapas; Incidente conserva el suyo
        const t: any = paginated.find((x: any) => x.id === viewingTicketId)
        const isCdc = t?.ticket_type === 'control_cambio' || t?.folio?.startsWith('CDC-')
        return isCdc ? (
          <CdcDetailModal
            incidentId={viewingTicketId}
            onClose={() => setViewingTicketId(null)}
            onChanged={fetchAll}
          />
        ) : (
          <IncidentDetailModal
            incidentId={viewingTicketId}
            onClose={() => setViewingTicketId(null)}
            onChanged={fetchAll}
          />
        )
      })()}
      {viewingCdcId && (
        <CdcDetailModal
          incidentId={viewingCdcId}
          onClose={() => setViewingCdcId(null)}
          onChanged={() => { fetchAll(); setCdcBoardKey(k => k + 1) }}
        />
      )}
      </div>
    </div>
  )
}
