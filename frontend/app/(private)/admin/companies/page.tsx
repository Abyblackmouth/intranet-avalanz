'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Building2, CheckCircle2, Search } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { GroupRow, CompanyRow } from '@/types/company.types'
import { getGroups, getCompanies, enableCompany, disableCompany } from '@/services/adminService'

export default function CompaniesPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }
  }, [])

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    errorTimerRef.current = setTimeout(() => setError(null), 3000)
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [groupsRes, companiesRes] = await Promise.all([
        getGroups({ per_page: 100 }),
        getCompanies({ per_page: 100 }),
      ])

      const groupsData: GroupRow[] = groupsRes.data?.data?.data ?? []
      const companiesData: CompanyRow[] = companiesRes.data?.data?.data ?? []

      const merged = groupsData.map((g) => ({
        ...g,
        companies: companiesData.filter((c) => c.group_id === g.group_id),
      }))

      setGroups(merged)
    } catch {
      showError('No se pudo cargar la información')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mounted) fetchData()
  }, [mounted, fetchData])

  const handleToggle = async (company: CompanyRow) => {
    if (!mounted || togglingId) return
    setTogglingId(company.company_id)

    const newActive = !company.is_active
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        companies: (g.companies ?? []).map((c) =>
          c.company_id === company.company_id ? { ...c, is_active: newActive } : c
        ),
      }))
    )

    try {
      if (company.is_active) {
        await disableCompany(company.company_id)
      } else {
        await enableCompany(company.company_id)
      }
    } catch (err: any) {
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          companies: (g.companies ?? []).map((c) =>
            c.company_id === company.company_id ? { ...c, is_active: company.is_active } : c
          ),
        }))
      )
      const msg = err?.response?.data?.message ?? 'No se pudo cambiar el estado'
      showError(msg)
    } finally {
      setTogglingId(null)
    }
  }

  if (!mounted) return null

  const totalCompanies = groups.reduce((acc, g) => acc + (g.companies?.length ?? 0), 0)
  const activeCompanies = groups.reduce(
    (acc, g) => acc + (g.companies?.filter((c) => c.is_active).length ?? 0),
    0
  )

  const searchLower = search.toLowerCase()
  const filteredGroups = groups
    .map((g) => ({
      ...g,
      companies: (g.companies ?? []).filter((c) => {
        if (!search) return true
        return (
          c.nombre_comercial.toLowerCase().includes(searchLower) ||
          c.name.toLowerCase().includes(searchLower) ||
          (c.rfc ?? '').toLowerCase().includes(searchLower)
        )
      }),
    }))
    .filter((g) => !search || (g.companies?.length ?? 0) > 0)

  return (
    <PageWrapper title="Empresas" subtitle="Administración de grupos y empresas">

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Building2 size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Grupos</p>
            <p className="text-2xl font-bold text-slate-800">{groups.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
          <div className="p-2 bg-violet-50 rounded-lg">
            <Building2 size={20} className="text-violet-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total empresas</p>
            <p className="text-2xl font-bold text-slate-800">{totalCompanies}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Activas</p>
            <p className="text-2xl font-bold text-slate-800">{activeCompanies}</p>
          </div>
        </div>
      </div>

      {/* Buscador + error */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative" style={{ width: '320px' }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o RFC..."
            autoComplete="off"
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-20 text-slate-400 text-sm">Cargando...</div>
      )}

      {/* Grupos y empresas */}
      {!isLoading && (
        <div className="space-y-8">
          {filteredGroups.map((group) => (
            <div key={group.group_id}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">
                    {group.name}
                  </h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    group.is_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {group.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {group.companies?.length ?? 0} empresa{group.companies?.length !== 1 ? 's' : ''}
                </span>
              </div>

              {group.companies && group.companies.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {group.companies.map((company) => (
                    <div
                      key={company.company_id}
                      className="bg-white rounded-xl border border-slate-200 shadow-md hover:shadow-lg transition-shadow duration-200 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${
                          company.is_active ? 'bg-emerald-400' : 'bg-red-400'
                        }`} />
                        <p className="text-sm font-bold text-slate-800 leading-tight truncate">
                          {company.nombre_comercial}
                        </p>
                      </div>

                      <div className="ml-5 mb-0.5">
                        <p className="text-xs text-slate-500 truncate">
                          <span className="font-semibold text-slate-600">RFC:</span>{' '}
                          {company.rfc ?? <span className="italic text-slate-300">Sin RFC</span>}
                        </p>
                      </div>

                      <p className="ml-5 text-xs text-slate-400 leading-snug line-clamp-2">
                        {company.name}
                      </p>

                      {mounted && isSuperAdmin() && (
                        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                          <span className={`text-xs font-medium transition-colors duration-300 ${
                            company.is_active ? 'text-emerald-600' : 'text-red-400'
                          }`}>
                            {company.is_active ? 'Activa' : 'Inactiva'}
                          </span>
                          <button
                            onClick={() => handleToggle(company)}
                            disabled={togglingId === company.company_id}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed ${
                              company.is_active ? 'bg-emerald-500' : 'bg-slate-200'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
                                company.is_active ? 'translate-x-[18px]' : 'translate-x-[2px]'
                              }`}
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-slate-400 bg-white rounded-xl border border-slate-200">
                  {search ? 'Sin resultados para esta búsqueda' : 'Sin empresas registradas en este grupo'}
                </div>
              )}
            </div>
          ))}

          {filteredGroups.length === 0 && !isLoading && (
            <div className="text-center py-20 text-slate-400 text-sm">
              No se encontraron resultados para &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  )
}
