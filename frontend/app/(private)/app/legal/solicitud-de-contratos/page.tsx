'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, SlidersHorizontal, Flag, FileCheck, Clock } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import ContractRequestsTable from '@/components/app/legal/ContractRequestsTable'
import { useAuthStore } from '@/store/authStore'
import { ContractRequestListItem, ContractType } from '@/types/contract.types'
import { getContractRequests, getContractTypes } from '@/services/legalService'

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
  if (roles.includes('super_admin')) return 'super_admin'
  if (roles.includes('coordinador_legal')) return 'coordinador_legal'
  if (roles.includes('director')) return 'director'
  if (roles.includes('abogado')) return 'abogado'
  return 'solicitante'
}

export default function ContractRequestsPage() {
  const { user } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  const [items, setItems] = useState<ContractRequestListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
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

      const res = await getContractRequests(params)
      setItems(res.data.data.data || [])
      setTotal(res.data.data.meta?.total || 0)
    } catch {
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [page, perPage, search, filterStatus, filterType, refreshTick])

  const fetchContractTypes = useCallback(async () => {
    try {
      const res = await getContractTypes(true)
      setContractTypes(res.data.data || [])
    } catch {
      setContractTypes([])
    }
  }, [])

  const fetchKPIs = useCallback(async () => {
    try {
      const [activeRes, overdueRes, signaturesRes] = await Promise.all([
        getContractRequests({ per_page: 1 }),
        getContractRequests({ per_page: 1, is_sla_breached: true }),
        getContractRequests({ per_page: 1, status: 'en_firmas' }),
      ])
      setTotalActive(activeRes.data.data.meta?.total || 0)
      setTotalOverdue(overdueRes.data.data.meta?.total || 0)
      setTotalInSignatures(signaturesRes.data.data.meta?.total || 0)
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
          <button className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <Plus size={16} />
            Nueva solicitud
          </button>
        ) : undefined
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <FileCheck size={18} className="text-[#1a4fa0]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{totalActive}</p>
            <p className="text-xs text-slate-400 mt-0.5">Solicitudes activas</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <Flag size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{totalOverdue}</p>
            <p className="text-xs text-slate-400 mt-0.5">Atrasadas (SLA vencido)</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <Clock size={18} className="text-violet-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-violet-600">{totalInSignatures}</p>
            <p className="text-xs text-slate-400 mt-0.5">En espera de firmas</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
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
          Mostrando {items.length} de {total} solicitudes
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
