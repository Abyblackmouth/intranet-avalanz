'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ShieldCheck, ShieldHalf, Plus, MoreHorizontal, Pencil, Trash2,
  AlertCircle, X, Search, Building2, Globe, CheckCircle2, XCircle,
} from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { GlobalRoleRow, OperationalRoleRow } from '@/types/role.types'
import {
  getGlobalRoles, createGlobalRole, updateGlobalRole, deleteGlobalRole,
  getOperationalRoles, createOperationalRole, updateOperationalRole, deleteOperationalRole,
} from '@/services/roleService'

// ── Badge de scope ────────────────────────────────────────────────────────────
function ScopeBadge({ scope }: { scope: 'empresa' | 'corporativo' }) {
  return scope === 'corporativo' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
      <Globe size={10} />
      Corporativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
      <Building2 size={10} />
      Empresa
    </span>
  )
}

// ── Modal rol global ──────────────────────────────────────────────────────────
function GlobalRoleModal({
  role, onClose, onSaved,
}: {
  role?: GlobalRoleRow
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: role?.name ?? '',
    description: role?.description ?? '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!form.name.trim()) return setError('El nombre es obligatorio')
    setIsSaving(true)
    try {
      if (role) {
        await updateGlobalRole(role.role_id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        })
      } else {
        await createGlobalRole({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        })
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No se pudo guardar')
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ShieldCheck size={18} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-slate-800">
              {role ? 'Editar rol global' : 'Nuevo rol global'}
            </h2>
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
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ej. Administrador TI"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
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
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal rol operativo ───────────────────────────────────────────────────────
function OperationalRoleModal({
  role, onClose, onSaved,
}: {
  role?: OperationalRoleRow
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: role?.name ?? '',
    description: role?.description ?? '',
    scope: role?.scope ?? 'empresa' as 'empresa' | 'corporativo',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!form.name.trim()) return setError('El nombre es obligatorio')
    setIsSaving(true)
    try {
      if (role) {
        await updateOperationalRole(role.role_id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          scope: form.scope,
        })
      } else {
        await createOperationalRole({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          scope: form.scope,
        })
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No se pudo guardar')
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-50 rounded-lg">
              <ShieldHalf size={18} className="text-violet-600" />
            </div>
            <h2 className="font-semibold text-slate-800">
              {role ? 'Editar rol operativo' : 'Nuevo rol operativo'}
            </h2>
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
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ej. Gerente, Supervisor, Operador"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Descripción opcional..."
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Alcance <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, scope: 'empresa' }))}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  form.scope === 'empresa'
                    ? 'border-[#1a4fa0] bg-blue-50 text-[#1a4fa0]'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Building2 size={16} />
                Empresa
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, scope: 'corporativo' }))}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  form.scope === 'corporativo'
                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Globe size={16} />
                Corporativo
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {form.scope === 'empresa'
                ? 'El usuario solo verá datos de su empresa asignada.'
                : 'El usuario puede ver datos de todas las empresas del grupo.'}
            </p>
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
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal confirmar eliminación ───────────────────────────────────────────────
function ConfirmDelete({
  title, description, onClose, onConfirm, isLoading, error,
}: {
  title: string
  description: string
  onClose: () => void
  onConfirm: () => void
  isLoading: boolean
  error: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-50 rounded-lg">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">{description}</p>
        {error && (
          <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isLoading ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de rol ────────────────────────────────────────────────────────────
function RoleCard({
  title, slug, description, isActive, badge, onEdit, onDelete, isSuperAdmin,
}: {
  title: string
  slug: string
  description: string | null
  isActive: boolean
  badge?: React.ReactNode
  onEdit: () => void
  onDelete: () => void
  isSuperAdmin: boolean
}) {
  const [openMenu, setOpenMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleMenuOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right })
    setOpenMenu(true)
  }

  return (
    <div className="bg-white rounded-xl border-2 border-slate-300 shadow-md hover:shadow-xl hover:border-[#1a4fa0] transition-all p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
            {badge}
            {isActive
              ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              : <XCircle size={14} className="text-red-400 shrink-0" />
            }
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block">{slug}</span>
        </div>
        {isSuperAdmin && (
          <button
            ref={btnRef}
            onClick={handleMenuOpen}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition shrink-0"
          >
            <MoreHorizontal size={20} />
          </button>
        )}
      </div>
      {description && (
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
      )}

      {openMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(false)} />
          <div className="fixed z-50 w-40 bg-white border-2 border-slate-300 rounded-xl shadow-2xl py-1.5 flex flex-col" style={{ top: menuPos.top, right: menuPos.right }}>
            <button
              onClick={() => { setOpenMenu(false); onEdit() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-300 transition-colors"
            >
              <Pencil size={14} className="text-slate-400" />
              Editar
            </button>
            <div className="h-px bg-slate-200 my-1" />
            <button
              onClick={() => { setOpenMenu(false); onDelete() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-200 transition-colors"
            >
              <Trash2 size={14} className="text-red-400" />
              Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function RolesPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  const [globalRoles, setGlobalRoles] = useState<GlobalRoleRow[]>([])
  const [operationalRoles, setOperationalRoles] = useState<OperationalRoleRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'todos' | 'empresa' | 'corporativo'>('todos')

  // Modales rol global
  const [showGlobalForm, setShowGlobalForm] = useState(false)
  const [editingGlobal, setEditingGlobal] = useState<GlobalRoleRow | null>(null)
  const [deletingGlobal, setDeletingGlobal] = useState<GlobalRoleRow | null>(null)
  const [isDeletingGlobal, setIsDeletingGlobal] = useState(false)
  const [deleteGlobalError, setDeleteGlobalError] = useState<string | null>(null)

  // Modales rol operativo
  const [showOpForm, setShowOpForm] = useState(false)
  const [editingOp, setEditingOp] = useState<OperationalRoleRow | null>(null)
  const [deletingOp, setDeletingOp] = useState<OperationalRoleRow | null>(null)
  const [isDeletingOp, setIsDeletingOp] = useState(false)
  const [deleteOpError, setDeleteOpError] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    errorTimerRef.current = setTimeout(() => setError(null), 3000)
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [globalRes, opRes] = await Promise.all([
        getGlobalRoles({ per_page: 100 }),
        getOperationalRoles({ per_page: 100 }),
      ])
      setGlobalRoles(globalRes.data?.data?.data ?? [])
      setOperationalRoles(opRes.data?.data?.data ?? [])
    } catch {
      showError('No se pudo cargar la información')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { if (mounted) fetchData() }, [mounted, fetchData])

  const handleDeleteGlobal = async () => {
    if (!deletingGlobal) return
    setIsDeletingGlobal(true)
    setDeleteGlobalError(null)
    try {
      await deleteGlobalRole(deletingGlobal.role_id)
      setDeletingGlobal(null)
      fetchData()
    } catch (err: any) {
      setDeleteGlobalError(err?.response?.data?.message ?? 'No se pudo eliminar')
    } finally {
      setIsDeletingGlobal(false)
    }
  }

  const handleDeleteOp = async () => {
    if (!deletingOp) return
    setIsDeletingOp(true)
    setDeleteOpError(null)
    try {
      await deleteOperationalRole(deletingOp.role_id)
      setDeletingOp(null)
      fetchData()
    } catch (err: any) {
      setDeleteOpError(err?.response?.data?.message ?? 'No se pudo eliminar')
    } finally {
      setIsDeletingOp(false)
    }
  }

  if (!mounted) return null

  const searchLower = search.toLowerCase()

  const filteredGlobal = globalRoles.filter(r =>
    !search || r.name.toLowerCase().includes(searchLower) || r.slug.includes(searchLower)
  )

  const filteredOp = operationalRoles.filter(r => {
    const matchSearch = !search || r.name.toLowerCase().includes(searchLower) || r.slug.includes(searchLower)
    const matchScope = scopeFilter === 'todos' || r.scope === scopeFilter
    return matchSearch && matchScope
  })

  return (
    <PageWrapper
      title="Roles"
      description="Gestión de roles globales y operativos del sistema"
      actions={
        mounted && isSuperAdmin() ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGlobalForm(true)}
              className="flex items-center gap-2 border border-[#1a4fa0] text-[#1a4fa0] text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-50 transition"
            >
              <Plus size={15} />
              Rol global
            </button>
            <button
              onClick={() => setShowOpForm(true)}
              className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={15} />
              Rol operativo
            </button>
          </div>
        ) : null
      }
    >
      {/* Buscador y filtros */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative" style={{ width: '280px' }}>
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
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(['todos', 'empresa', 'corporativo'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                scopeFilter === s
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {error && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-20 text-slate-400 text-sm">Cargando...</div>
      )}

      {!isLoading && (
        <div className="space-y-8">

          {/* Roles globales */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={16} className="text-blue-600" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Roles Globales</h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filteredGlobal.length}</span>
            </div>
            {filteredGlobal.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                {search ? `Sin resultados para "${search}"` : 'No hay roles globales registrados'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGlobal.map(role => (
                  <RoleCard
                    key={role.role_id}
                    title={role.name}
                    slug={role.slug}
                    description={role.description}
                    isActive={role.is_active}
                    isSuperAdmin={isSuperAdmin()}
                    onEdit={() => setEditingGlobal(role)}
                    onDelete={() => { setDeletingGlobal(role); setDeleteGlobalError(null) }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Roles operativos */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldHalf size={16} className="text-violet-600" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Roles Operativos</h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filteredOp.length}</span>
            </div>
            {filteredOp.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                {search || scopeFilter !== 'todos' ? 'Sin resultados para los filtros aplicados' : 'No hay roles operativos registrados'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOp.map(role => (
                  <RoleCard
                    key={role.role_id}
                    title={role.name}
                    slug={role.slug}
                    description={role.description}
                    isActive={role.is_active}
                    badge={<ScopeBadge scope={role.scope} />}
                    isSuperAdmin={isSuperAdmin()}
                    onEdit={() => setEditingOp(role)}
                    onDelete={() => { setDeletingOp(role); setDeleteOpError(null) }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales rol global */}
      {(showGlobalForm || editingGlobal) && (
        <GlobalRoleModal
          role={editingGlobal ?? undefined}
          onClose={() => { setShowGlobalForm(false); setEditingGlobal(null) }}
          onSaved={() => { setShowGlobalForm(false); setEditingGlobal(null); fetchData() }}
        />
      )}

      {deletingGlobal && (
        <ConfirmDelete
          title="Eliminar rol global"
          description={`¿Estás seguro de que deseas eliminar el rol "${deletingGlobal.name}"?`}
          onClose={() => { setDeletingGlobal(null); setDeleteGlobalError(null) }}
          onConfirm={handleDeleteGlobal}
          isLoading={isDeletingGlobal}
          error={deleteGlobalError}
        />
      )}

      {/* Modales rol operativo */}
      {(showOpForm || editingOp) && (
        <OperationalRoleModal
          role={editingOp ?? undefined}
          onClose={() => { setShowOpForm(false); setEditingOp(null) }}
          onSaved={() => { setShowOpForm(false); setEditingOp(null); fetchData() }}
        />
      )}

      {deletingOp && (
        <ConfirmDelete
          title="Eliminar rol operativo"
          description={`¿Estás seguro de que deseas eliminar el rol "${deletingOp.name}"?`}
          onClose={() => { setDeletingOp(null); setDeleteOpError(null) }}
          onConfirm={handleDeleteOp}
          isLoading={isDeletingOp}
          error={deleteOpError}
        />
      )}
    </PageWrapper>
  )
}
