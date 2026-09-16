'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import PageWrapper from '@/components/layout/PageWrapper'
import { getIncidents, getSystems, getSeverities } from '@/services/itServiceDeskService'
import { Search, Eye, Plus } from 'lucide-react'
import CreateIncidentModal from '@/components/app/it-service-desk/mesa-de-soporte/CreateIncidentModal'

interface IncidentRow {
  id: string; folio: string; title: string; status: string
  system_id: string; severity_reported_id: string; severity_validated_id: string | null
  assigned_to_user_id: string | null
  requester_name: string; requester_company_name: string
  created_at: string; is_sla_breached: boolean
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
const SEV_CLASS: Record<string, string> = {
  S1: 'bg-red-500/[0.10] text-red-700 border border-red-500/25',
  S2: 'bg-orange-500/[0.12] text-orange-700 border border-orange-500/25',
  S3: 'bg-amber-500/[0.12] text-amber-700 border border-amber-500/25',
  S4: 'bg-emerald-500/[0.12] text-emerald-700 border border-emerald-500/25',
}

export default function MesaDeSoportePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [systems, setSystems] = useState<CatalogItem[]>([])
  const [severities, setSeverities] = useState<SeverityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [activeSevs, setActiveSevs] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)

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

  return (
    <PageWrapper
      title="Mesa de Soporte"
      description="Tickets de soporte técnico y funcional"
      actions={
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[#7c2d12] rounded-lg hover:bg-[#6b2610] transition"
        >
          <Plus size={15} /> Nuevo ticket
        </button>
      }
    >
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-500/[0.14] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-10px_rgba(15,23,42,0.14)] overflow-hidden">
        <div className="p-4 border-b border-slate-500/10 bg-white/30">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por folio o título..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-500/20 bg-white/65 outline-none focus:border-[#7c2d12]/45 focus:ring-2 focus:ring-[#7c2d12]/10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-slate-500/20 bg-white/65 outline-none focus:border-[#7c2d12]/45"
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
                onClick={() => setActiveSevs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
                className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition ${
                  activeSevs.includes(code)
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white/65 text-slate-700 border-slate-500/20'
                }`}
              >
                {code}
              </button>
            ))}
            <span className="text-[11px] text-slate-400 font-mono ml-auto">{filtered.length} de {incidents.length} tickets</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-500/5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-500/10">
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Sistema</th>
                <th className="px-4 py-3">Severidad</th>
                <th className="px-4 py-3">Estatus</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-500/10">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">Sin tickets que coincidan</td></tr>
              ) : (
                filtered.map(t => {
                  const sev = sevInfo(t.severity_validated_id ?? t.severity_reported_id)
                  return (
                    <tr key={t.id} className="hover:bg-white/50 transition cursor-pointer" onClick={() => router.push(`/app/it-service-desk/mesa-de-soporte/${t.id}`)}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.folio}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">{t.title}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{systemName(t.system_id)}</td>
                      <td className="px-4 py-3">
                        {sev && <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${SEV_CLASS[sev.code] ?? ''}`}>{sev.code}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_CLASS[t.status] ?? ''}`}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{t.requester_name}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/app/it-service-desk/mesa-de-soporte/${t.id}`) }}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-500/10 transition"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateIncidentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchAll() }}
        />
      )}
    </PageWrapper>
  )
}
