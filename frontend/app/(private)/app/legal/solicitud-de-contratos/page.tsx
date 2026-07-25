'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, SlidersHorizontal, Flag, FileCheck, Clock } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import ContractRequestsTable from '@/components/app/legal/ContractRequestsTable'
import { useAuthStore } from '@/store/authStore'
import { ContractRequestListItem, ContractType } from '@/types/contract.types'
import { getEnvelopes, getContractTypes } from '@/services/legalService'
import { useWSEvent } from '@/hooks/useWebSocket'

type LegalRole = 'solicitante' | 'abogado' | 'coordinador_legal' | 'director' | 'super_admin'

const STATUS_OPTIONS = [
  { value: 'all',               label: 'Todos los estados' },
  { value: 'borrador',          label: 'Borrador' },
  { value: 'pendiente_legal',   label: 'Pendiente legal' },
  { value: 'pendiente_cliente', label: 'Pendiente cliente' },
  { value: 'en_revision_legal', label: 'En revisión legal' },
  { value: 'en_firmas',         label: 'En firmas' },
  { value: 'firmado_parcial',   label: 'Firmado parcial' },
  { value: 'completado',        label: 'Completado' },
  { value: 'rechazado',         label: 'Rechazado' },
]

const resolveLegalRole = (roles: string[]): LegalRole => {
  const flat = roles.map(r => r.includes(':') ? r.split(':')[1] : r)
  if (flat.includes('super_admin')) return 'super_admin'
  if (flat.includes('coordinador_legal')) return 'coordinador_legal'
  if (flat.includes('director')) return 'director'
  if (flat.includes('abogado')) return 'abogado'
  return 'solicitante'
}

export default function ContractRequestsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  const [items, setItems] = useState<ContractRequestListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(8)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])

  const [totalActive, setTotalActive] = useState(0)
  const [totalOverdue, setTotalOverdue] = useState(0)
  const [totalInSignatures, setTotalInSignatures] = useState(0)

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
      const [activeRes, overdueRes, signaturesRes] = await Promise.all([
        getEnvelopes({ per_page: 1 }),
        getEnvelopes({ per_page: 1, is_sla_breached: true }),
        getEnvelopes({ per_page: 1, status: 'en_firmas' }),
      ])
      setTotalActive(activeRes.data.total || 0)
      setTotalOverdue(overdueRes.data.total || 0)
      setTotalInSignatures(signaturesRes.data.total || 0)
    } catch {
      // silencioso
    }
  }, [])

  useEffect(() => { fetchContractTypes() }, [fetchContractTypes])
  useEffect(() => { fetchKPIs() }, [fetchKPIs, refreshTick])
  useEffect(() => { fetchItems() }, [page, search, filterStatus, filterType, refreshTick])

  const handleRefresh = (silent = false) => {
    setRefreshTick(t => t + 1)
    if (!silent) fetchItems(false)
  }

  // Auto-refresh tabla via WebSocket
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

  const showNewButton = legalRole === 'solicitante' || legalRole === 'super_admin'

  return (
    <PageWrapper
      title="Solicitud de contratos"
      description="Gestiona y da seguimiento a las solicitudes legales del grupo"
      actions={
        mounted && showNewButton ? (
          <button onClick={() => router.push('/app/legal/solicitud-de-contratos/nuevo')} className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <Plus size={16} />
            Crear contrato
          </button>
        ) : undefined
      }
    >
      {/* KPIs — en una sola linea, mas delgados */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded-xl ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(16,45,90,0.05)] px-4 py-2.5 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <FileCheck size={15} className="text-[#1a4fa0]" />
          </div>
          <p className="text-lg font-bold text-slate-900 leading-none">{totalActive}</p>
          <p className="text-xs text-slate-500">Solicitudes activas</p>
        </div>
        <div className="bg-white rounded-xl ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(16,45,90,0.05)] px-4 py-2.5 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <Flag size={15} className="text-red-600" />
          </div>
          <p className="text-lg font-bold text-red-600 leading-none">{totalOverdue}</p>
          <p className="text-xs text-slate-500">Atrasadas (SLA vencido)</p>
        </div>
        <div className="bg-white rounded-xl ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(16,45,90,0.05)] px-4 py-2.5 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <Clock size={15} className="text-violet-600" />
          </div>
          <p className="text-lg font-bold text-violet-600 leading-none">{totalInSignatures}</p>
          <p className="text-xs text-slate-500">En espera de firmas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Folio o solicitante..."
                autoComplete="off"
                value={search}
                onChange={handleSearch}
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150"
              />
            </div>
          </div>

          <div className="min-w-44">
            <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="min-w-44">
            <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de contrato</label>
            <select
              value={filterType}
              onChange={e => { setFilterType(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todos los tipos</option>
              {contractTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            <SlidersHorizontal size={14} />
            Limpiar
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          Mostrando {items.length} de {total} sobres
        </p>
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
        role={legalRole}
      />
    </PageWrapper>
  )
}