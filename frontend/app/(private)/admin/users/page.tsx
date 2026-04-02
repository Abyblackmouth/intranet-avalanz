'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import UserTable from '@/components/admin/users/UserTable'
import UserForm from '@/components/admin/users/UserForm'
import { useAuthStore } from '@/store/authStore'
import { UserRow } from '@/types/user.types'
import api from '@/services/api'

export default function UsersPage() {
  const { isSuperAdmin } = useAuthStore()

  const [mounted, setMounted] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(15)
  const [isLoading, setIsLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCompany, setFilterCompany] = useState<string>('all')
  const [companies, setCompanies] = useState<{ company_id: string; nombre_comercial: string }[]>([])

  useEffect(() => { setMounted(true) }, [])

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string | number> = { page, per_page: perPage }
      if (search) params.search = search
      if (filterStatus === 'active') params.is_active = 'true'
      if (filterStatus === 'inactive') params.is_active = 'false'
      if (filterCompany !== 'all') params.company_id = filterCompany

      const res = await api.get('/api/v1/users/', { params })
      setUsers(res.data.data.data || [])
      setTotal(res.data.data.meta?.total || 0)
    } catch {
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }, [page, perPage, search, filterStatus, filterCompany])

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/companies/', { params: { per_page: 100 } })
      setCompanies(res.data.data.data || [])
    } catch {
      setCompanies([])
    }
  }, [])

  useEffect(() => { fetchCompanies() }, [fetchCompanies])
  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageWrapper
        title="Usuarios"
        description="Gestiona los usuarios de la plataforma"
        actions={
          mounted && isSuperAdmin() ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={16} />
              Nuevo usuario
            </button>
          ) : undefined
        }
      >
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">

            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nombre, correo o matrícula..."
                  value={search}
                  onChange={handleSearch}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="min-w-36">
              <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="locked">Bloqueados</option>
              </select>
            </div>

            {mounted && isSuperAdmin() && (
              <div className="min-w-44">
                <label className="block text-xs font-medium text-slate-500 mb-1">Empresa</label>
                <select
                  value={filterCompany}
                  onChange={(e) => { setFilterCompany(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Todas</option>
                  {companies.map((c) => (
                    <option key={c.company_id} value={c.company_id}>{c.nombre_comercial}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => { setSearch(''); setFilterStatus('all'); setFilterCompany('all'); setPage(1) }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              <SlidersHorizontal size={14} />
              Limpiar
            </button>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            Mostrando {users.length} de {total} usuarios
          </p>
        </div>

        <UserTable
          users={users}
          isLoading={isLoading}
          onRefresh={fetchUsers}
          page={page}
          perPage={perPage}
          total={total}
          onPageChange={setPage}
        />
      </PageWrapper>

      {showForm && (
        <UserForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { fetchUsers(); setShowForm(false) }}
        />
      )}
    </>
  )
}
