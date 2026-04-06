'use client'

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, Search, Plus, MoreHorizontal, Pencil, Eye, Trash2, CheckCircle2, XCircle, AlertCircle, X, Building2 } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { GroupRow, CompanyRow } from '@/types/company.types'
import {
  getGroups, getCompanies,
  createGroup, updateGroup, deleteGroup,
  enableGroup, disableGroup,
} from '@/services/adminService'

// ── Modal crear / editar grupo ────────────────────────────────────────────────

function GroupForm({
  group,
  onClose,
  onSaved,
}: {
  group?: GroupRow
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) return setError('El nombre es obligatorio')
    setIsSaving(true)
    try {
      if (group) {
        await updateGroup(group.group_id, { name: name.trim(), description: description.trim() || null })
      } else {
        await createGroup({ name: name.trim(), description: description.trim() || null })
      }
      onSaved()
    } catch (err: any) {
      const msg = (err?.response?.data?.message ?? '') as string
      setError(msg.replace(/con slug '[^']*'/g, '').replace(/^Grupo\b/, 'El grupo') || 'No se pudo guardar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users size={18} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-slate-800">{group ? 'Editar grupo' : 'Nuevo grupo'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Grupo Avalanz"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Descripción opcional..."
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {isSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isSaving ? 'Guardando...' : 'Guardar grupo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel detalle grupo ───────────────────────────────────────────────────────

function GroupDetail({ group, companies, onClose }: { group: GroupRow; companies: CompanyRow[]; onClose: () => void }) {
  const initials = group.name.slice(0, 2).toUpperCase()
  const groupCompanies = companies.filter(c => c.group_id === group.group_id)
  const activeCount = groupCompanies.filter(c => c.is_active).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1a4fa0] flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{group.name}</h2>
              <p className="text-xs text-slate-500">{groupCompanies.length} empresa{groupCompanies.length !== 1 ? 's' : ''} · {activeCount} activa{activeCount !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Estado */}
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${group.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            {group.is_active
              ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
              : <XCircle size={20} className="text-red-400 shrink-0" />
            }
            <div>
              <p className={`text-sm font-semibold ${group.is_active ? 'text-emerald-700' : 'text-red-600'}`}>
                {group.is_active ? 'Grupo activo' : 'Grupo inactivo'}
              </p>
              <p className="text-xs text-slate-400">
                {group.is_active ? 'Disponible para asignación de empresas' : 'No disponible para nuevas empresas'}
              </p>
            </div>
          </div>

          {/* Info */}
          <div className="bg-white rounded-xl border border-slate-200 px-4">
            <div className="flex items-center gap-2 py-3 border-b border-slate-100">
              <Users size={14} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Información</p>
            </div>
            <div className="flex items-start justify-between py-3 border-b border-slate-100 gap-4">
              <span className="text-sm text-slate-500 shrink-0">Nombre</span>
              <span className="text-sm font-medium text-slate-800 text-right">{group.name}</span>
            </div>
            {group.description && (
              <div className="py-3 border-b border-slate-100">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Descripción</p>
                <p className="text-sm text-slate-800">{group.description}</p>
              </div>
            )}
            <div className="flex items-start justify-between py-3 gap-4">
              <span className="text-sm text-slate-500 shrink-0">Alta en sistema</span>
              <span className="text-sm font-medium text-slate-800 text-right">
                {new Date(group.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Empresas */}
          <div className="bg-white rounded-xl border border-slate-200 px-4">
            <div className="flex items-center gap-2 py-3 border-b border-slate-100">
              <Building2 size={14} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Empresas del grupo</p>
            </div>
            {groupCompanies.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-400">Sin empresas registradas</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {groupCompanies.map(c => (
                  <div key={c.company_id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${c.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.nombre_comercial}</p>
                        <p className="text-xs text-slate-400 truncate">{c.rfc ?? 'Sin RFC'}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${c.is_active ? 'text-emerald-600' : 'text-red-400'}`}>
                      {c.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function GroupsPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null)
  const [detailGroup, setDetailGroup] = useState<GroupRow | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<GroupRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) } }, [])

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    errorTimerRef.current = setTimeout(() => setError(null), 3000)
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [groupsRes, companiesRes] = await Promise.all([
        getGroups({ per_page: 100 }),
        getCompanies({ per_page: 100 }),
      ])
      setGroups(groupsRes.data?.data?.data ?? [])
      setCompanies(companiesRes.data?.data?.data ?? [])
    } catch {
      showError('No se pudo cargar la información')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { if (mounted) fetchData() }, [mounted, fetchData])

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, groupId: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right })
    setOpenMenuId(groupId)
  }

  const handleToggle = async (group: GroupRow) => {
    if (togglingId) return
    setTogglingId(group.group_id)

    const newActive = !group.is_active
    setGroups(prev => prev.map(g => g.group_id === group.group_id ? { ...g, is_active: newActive } : g))

    try {
      if (group.is_active) {
        await disableGroup(group.group_id)
      } else {
        await enableGroup(group.group_id)
      }
    } catch (err: any) {
      setGroups(prev => prev.map(g => g.group_id === group.group_id ? { ...g, is_active: group.is_active } : g))
      showError(err?.response?.data?.message ?? 'No se pudo cambiar el estado')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deletingGroup) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteGroup(deletingGroup.group_id)
      setDeletingGroup(null)
      fetchData()
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message ?? 'No se pudo eliminar el grupo')
    } finally {
      setIsDeleting(false)
    }
  }

  if (!mounted) return null

  const searchLower = search.toLowerCase()
  const filtered = groups.filter(g =>
    !search ||
    g.name.toLowerCase().includes(searchLower) ||
    (g.description ?? '').toLowerCase().includes(searchLower)
  )

  const getCompanyCount = (groupId: string) => companies.filter(c => c.group_id === groupId).length
  const getActiveCount = (groupId: string) => companies.filter(c => c.group_id === groupId && c.is_active).length

  return (
    <PageWrapper
      title="Grupos"
      description="Administración de grupos empresariales"
      actions={
        mounted && isSuperAdmin() ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={15} />
            Nuevo grupo
          </button>
        ) : null
      }
    >
      {/* Buscador + error */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative" style={{ width: '320px' }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
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

      {/* Lista de grupos */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(group => {
            const total = getCompanyCount(group.group_id)
            const active = getActiveCount(group.group_id)

            return (
              <div
                key={group.group_id}
                className="bg-white rounded-xl border-2 border-slate-300 shadow-md hover:shadow-xl hover:border-[#1a4fa0] transition-all duration-200 px-5 py-4 cursor-pointer relative"
              >
                {/* Boton 3 puntos */}
                {mounted && isSuperAdmin() && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openMenu(e, group.group_id) }}
                    className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  >
                    <MoreHorizontal size={20} />
                  </button>
                )}

                {/* Header tarjeta */}
                <div className="flex items-center gap-3 mb-4 pr-8">
                  <div className="w-10 h-10 rounded-xl bg-[#1a4fa0] flex items-center justify-center shrink-0">
                    <span className="text-white text-sm font-bold">{group.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{group.name}</p>
                    {group.description && (
                      <p className="text-xs text-slate-400 truncate">{group.description}</p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-400 mb-0.5">Total empresas</p>
                    <p className="text-lg font-bold text-slate-800">{total}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-400 mb-0.5">Activas</p>
                    <p className="text-lg font-bold text-emerald-700">{active}</p>
                  </div>
                </div>

                {/* Footer toggle */}
                {mounted && isSuperAdmin() && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className={`text-xs font-medium transition-colors duration-300 ${group.is_active ? 'text-emerald-600' : 'text-red-400'}`}>
                      {group.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    <button
                      onClick={() => handleToggle(group)}
                      disabled={togglingId === group.group_id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed ${group.is_active ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${group.is_active ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && !isLoading && (
            <div className="col-span-3 text-center py-20 text-slate-400 text-sm">
              {search ? `No se encontraron resultados para "${search}"` : 'No hay grupos registrados'}
            </div>
          )}
        </div>
      )}

      {/* Menu flotante */}
      {openMenuId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
          <div className="fixed z-50 w-44 bg-white border-2 border-slate-300 rounded-xl shadow-2xl py-1.5 flex flex-col" style={{ top: menuPos.top, right: menuPos.right }}>
            <button
              onClick={() => {
                const g = groups.find(g => g.group_id === openMenuId)
                if (g) setDetailGroup(g)
                setOpenMenuId(null)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-300 transition-colors"
            >
              <Eye size={14} className="text-slate-400" />
              Ver detalle
            </button>
            <button
              onClick={() => {
                const g = groups.find(g => g.group_id === openMenuId)
                if (g) setEditingGroup(g)
                setOpenMenuId(null)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-300 transition-colors"
            >
              <Pencil size={14} className="text-slate-400" />
              Editar
            </button>
            <div className="h-px bg-slate-200 my-1" />
            <button
              onClick={() => {
                const g = groups.find(g => g.group_id === openMenuId)
                if (g) { setDeletingGroup(g); setDeleteError(null) }
                setOpenMenuId(null)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-200 transition-colors"
            >
              <Trash2 size={14} className="text-red-400" />
              Eliminar
            </button>
          </div>
        </>
      )}

      {/* Modal crear/editar */}
      {(showForm || editingGroup) && (
        <GroupForm
          group={editingGroup ?? undefined}
          onClose={() => { setShowForm(false); setEditingGroup(null) }}
          onSaved={() => { setShowForm(false); setEditingGroup(null); fetchData() }}
        />
      )}

      {/* Panel detalle */}
      {detailGroup && (
        <GroupDetail
          group={detailGroup}
          companies={companies}
          onClose={() => setDetailGroup(null)}
        />
      )}

      {/* Modal confirmar eliminacion */}
      {deletingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 rounded-lg">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <h2 className="font-semibold text-slate-800">Eliminar grupo</h2>
            </div>
            <p className="text-sm text-slate-600 mb-2">
              ¿Estás seguro de que deseas eliminar <span className="font-semibold">{deletingGroup.name}</span>?
            </p>
            <p className="text-xs text-slate-400 mb-4">
              El grupo debe estar inactivo y sin empresas asociadas. Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => { setDeletingGroup(null); setDeleteError(null) }}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isDeleting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isDeleting ? 'Eliminando...' : 'Eliminar grupo'}
              </button>
            </div>
          </div>
        </div>
      )}

    </PageWrapper>
  )
}
