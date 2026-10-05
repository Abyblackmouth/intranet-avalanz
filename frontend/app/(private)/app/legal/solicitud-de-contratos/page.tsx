'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import ContractRequestsTable from '@/components/app/legal/ContractRequestsTable'
import { useAuthStore } from '@/store/authStore'
import { ContractRequestListItem, ContractType } from '@/types/contract.types'
import { getEnvelopes, getContractTypes } from '@/services/legalService'
import { useWSEvent } from '@/hooks/useWebSocket'

type LegalRole = 'solicitante' | 'jefe_solicitante' | 'abogado' | 'coordinador_legal' | 'director' | 'super_admin'

const QUICK_CHIPS: { value: string; label: string; dot: string }[] = [
  { value: 'all',               label: 'Todos',             dot: '' },
  { value: 'pendiente_legal',   label: 'Pendiente legal',   dot: '#f59e0b' },
  { value: 'en_revision_legal', label: 'En revisión',       dot: '#3b82f6' },
  { value: 'pendiente_cliente', label: 'Pendiente cliente', dot: '#f97316' },
  { value: 'en_firmas',         label: 'En firmas',         dot: '#8b5cf6' },
  { value: 'completado',        label: 'Completado',        dot: '#10b981' },
  { value: 'rechazado',         label: 'Rechazado',         dot: '#ef4444' },
]

const resolveLegalRole = (roles: string[]): LegalRole => {
  const flat = roles.map(r => r.includes(':') ? r.split(':')[1] : r)
  if (flat.includes('super_admin')) return 'super_admin'
  if (flat.includes('coordinador_legal')) return 'coordinador_legal'
  if (flat.includes('director')) return 'director'
  if (flat.includes('abogado')) return 'abogado'
  if (flat.includes('jefe_solicitante')) return 'jefe_solicitante'
  return 'solicitante'
}

export default function ContractRequestsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  const [items, setItems] = useState<ContractRequestListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(13)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])

  const [totalActive, setTotalActive] = useState(0)
  const [totalOverdue, setTotalOverdue] = useState(0)
  const [totalInSignatures, setTotalInSignatures] = useState(0)
  const [totalCompleted, setTotalCompleted] = useState(0)

  const legalRole: LegalRole = mounted && user
    ? resolveLegalRole((user as any).roles || [])
    : 'solicitante'

  useEffect(() => { setMounted(true) }, [])

  const fetchItems = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const params: Record<string, string | number | boolean> = { page, per_page: perPage }
      if (search) params.search = search
      if (filterStatus !== 'all') params.status = filterStatus
      if (filterType !== 'all') params.contract_type_id = filterType

      const res = await getEnvelopes(params)
      setItems(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch {
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [page, perPage, search, filterStatus, filterType, refreshTick])

  const fetchContractTypes = useCallback(async () => {
    try {
      const res = await getContractTypes(true)
      setContractTypes(res.data || [])
    } catch {
      setContractTypes([])
    }
  }, [])

  const fetchKPIs = useCallback(async () => {
    try {
      const [activeRes, overdueRes, signaturesRes, completedRes] = await Promise.all([
        getEnvelopes({ per_page: 1 }),
        getEnvelopes({ per_page: 1, is_sla_breached: true }),
        getEnvelopes({ per_page: 1, status: 'en_firmas' }),
        getEnvelopes({ per_page: 1, status: 'completado' }),
      ])
      setTotalActive(activeRes.data.total || 0)
      setTotalOverdue(overdueRes.data.total || 0)
      setTotalInSignatures(signaturesRes.data.total || 0)
      setTotalCompleted(completedRes.data.total || 0)
    } catch {
      // silencioso
    }
  }, [])

  useEffect(() => { fetchContractTypes() }, [fetchContractTypes])
  useEffect(() => { fetchKPIs() }, [fetchKPIs, refreshTick])
  useEffect(() => { fetchItems() }, [page, perPage, search, filterStatus, filterType, refreshTick])

  const handleRefresh = (silent = false) => {
    setRefreshTick(t => t + 1)
    if (!silent) fetchItems(false)
  }

  useWSEvent('legal.tabla_actualizada', useCallback(() => {
    setRefreshTick(t => t + 1)
  }, []))

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleClearFilters = () => {
    setSearch('')
    setFilterStatus('all')
    setFilterType('all')
    setPage(1)
  }

  const selectChip = (value: string) => {
    setFilterStatus(value)
    setPage(1)
  }

  const showNewButton = legalRole === 'solicitante' || legalRole === 'jefe_solicitante' || legalRole === 'super_admin'

  const Stat = ({ n, label, color }: { n: number; label: string; color: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color }}>{n}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-auto px-6 pt-4 pb-6 min-h-0">

        {/* Fila 1: stats (mismo contenedor/ancho que filtros) + boton Crear contrato a la misma altura */}
        <div className="flex items-stretch gap-2 mb-2.5">
          <div className="flex-1 flex items-center flex-wrap gap-x-6 gap-y-2 bg-white rounded-xl border border-slate-200 px-4 py-2.5">
            <Stat n={totalActive} label="Activas" color="#1a4fa0" />
            <span className="w-px h-4 bg-slate-200" />
            <Stat n={totalOverdue} label="Atrasadas" color="#dc2626" />
            <span className="w-px h-4 bg-slate-200" />
            <Stat n={totalInSignatures} label="En firmas" color="#7c3aed" />
            <span className="w-px h-4 bg-slate-200" />
            <Stat n={totalCompleted} label="Completadas" color="#059669" />
          </div>
          {mounted && showNewButton && (
            <button
              onClick={() => router.push('/app/legal/solicitud-de-contratos/nuevo')}
              className="inline-flex items-center gap-2 shrink-0 px-4 rounded-xl bg-[#1a4fa0] text-white text-[13px] font-semibold shadow-sm transition hover:bg-[#153f82]"
            >
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center"><Plus size={13} strokeWidth={2.5} /></span>
              Crear contrato
            </button>
          )}
        </div>

        {/* Fila 2: filtros */}
        <div className="flex items-center flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por folio, solicitante o tipo…"
              autoComplete="off"
              value={search}
              onChange={handleSearch}
              className="w-full pl-9 pr-3 h-9 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-400 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15 transition"
            />
          </div>

          {QUICK_CHIPS.map(c => {
            const on = filterStatus === c.value
            return (
              <button
                key={c.value}
                onClick={() => selectChip(c.value)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 h-9 rounded-lg border transition ${
                  on ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-[#1a4fa0] hover:text-[#1a4fa0]'
                }`}
              >
                {c.dot && <span className="w-[6px] h-[6px] rounded-full" style={{ background: c.dot }} />}
                {c.label}
              </button>
            )
          })}

          <select
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1) }}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white outline-none focus:border-[#1a4fa0] cursor-pointer"
          >
            <option value="all">Todos los tipos</option>
            {contractTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {(search || filterStatus !== 'all' || filterType !== 'all') && (
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 h-9 px-2"
            >
              <X size={13} /> Limpiar
            </button>
          )}
        </div>

        {/* Tabla */}
        <ContractRequestsTable
          items={items}
          isLoading={isLoading}
          onRefresh={handleRefresh}
          page={page}
          perPage={perPage}
          total={total}
          onPageChange={setPage}
          onPerPageChange={(n) => { setPerPage(n); setPage(1) }}
          role={legalRole}
        />
      </div>
    </div>
  )
}
