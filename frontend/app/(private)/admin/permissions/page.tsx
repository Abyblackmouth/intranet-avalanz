'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Key, Plus, MoreHorizontal, Pencil, Trash2,
  AlertCircle, X, Search, ChevronDown, ChevronRight,
  FolderOpen, FileKey,
} from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { GlobalPermissionRow, PermissionTree } from '@/types/role.types'
import { ModuleRow } from '@/types/module.types'
import {
  getGlobalPermissions, createGlobalPermission, updateGlobalPermission, deleteGlobalPermission,
  createSubmodulePermission, updateSubmodulePermission, deleteSubmodulePermission,
  getModulePermissionsTree,
} from '@/services/roleService'
import { getModules } from '@/services/adminService'

// ── Modal permiso global ──────────────────────────────────────────────────────
function GlobalPermissionModal({
  permission, onClose, onSaved,
}: {
  permission?: GlobalPermissionRow
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: permission?.name ?? '',
    description: permission?.description ?? '',
    category: permission?.category ?? '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!form.name.trim()) return setError('El nombre es obligatorio')
    setIsSaving(true)
    try {
      if (permission) {
        await updateGlobalPermission(permission.permission_id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
        })
      } else {
        await createGlobalPermission({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
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
            <div className="p-2 bg-amber-50 rounded-lg">
              <Key size={18} className="text-amber-600" />
            </div>
            <h2 className="font-semibold text-slate-800">
              {permission ? 'Editar permiso global' : 'Nuevo permiso global'}
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
              placeholder="Ej. Ver usuarios"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Categoría
            </label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
              placeholder="Ej. Usuarios, Reportes"
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

// ── Modal permiso de submódulo ────────────────────────────────────────────────
function SubmodulePermissionModal({
  submoduleId, submoduleName, permission, onClose, onSaved,
}: {
  submoduleId: string
  submoduleName: string
  permission?: { permission_id: string; name: string; description: string | null }
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: permission?.name ?? '',
    description: permission?.description ?? '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!form.name.trim()) return setError('El nombre es obligatorio')
    setIsSaving(true)
    try {
      if (permission) {
        await updateSubmodulePermission(submoduleId, permission.permission_id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        })
      } else {
        await createSubmodulePermission(submoduleId, {
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
            <div className="p-2 bg-emerald-50 rounded-lg">
              <FileKey size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">
                {permission ? 'Editar permiso' : 'Nuevo permiso'}
              </h2>
              <p className="text-xs text-slate-400">{submoduleName}</p>
            </div>
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
              placeholder="Ej. leer, crear, editar, eliminar"
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

// ── Menú de 3 puntos inline ───────────────────────────────────────────────────
function InlineMenu({
  onEdit, onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 w-36 bg-white border-2 border-slate-300 rounded-xl shadow-2xl py-1.5" style={{ top: pos.top, right: pos.right }}>
            <button
              onClick={() => { setOpen(false); onEdit() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-300 transition-colors"
            >
              <Pencil size={13} className="text-slate-400" />
              Editar
            </button>
            <div className="h-px bg-slate-200 my-1" />
            <button
              onClick={() => { setOpen(false); onDelete() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-200 transition-colors"
            >
              <Trash2 size={13} className="text-red-400" />
              Eliminar
            </button>
          </div>
        </>
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function PermissionsPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  // Permisos globales
  const [globalPermissions, setGlobalPermissions] = useState<GlobalPermissionRow[]>([])
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false)
  const [searchGlobal, setSearchGlobal] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // Árbol de permisos por módulo
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [selectedModuleId, setSelectedModuleId] = useState<string>('')
  const [tree, setTree] = useState<PermissionTree | null>(null)
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [expandedSubmodules, setExpandedSubmodules] = useState<Set<string>>(new Set())

  // Modal permiso global
  const [showGlobalForm, setShowGlobalForm] = useState(false)
  const [editingGlobal, setEditingGlobal] = useState<GlobalPermissionRow | null>(null)
  const [deletingGlobal, setDeletingGlobal] = useState<GlobalPermissionRow | null>(null)
  const [isDeletingGlobal, setIsDeletingGlobal] = useState(false)
  const [deleteGlobalError, setDeleteGlobalError] = useState<string | null>(null)

  // Modal permiso de submódulo
  const [addingPermTo, setAddingPermTo] = useState<{ submoduleId: string; submoduleName: string } | null>(null)
  const [editingSubPerm, setEditingSubPerm] = useState<{
    submoduleId: string
    submoduleName: string
    permission: { permission_id: string; name: string; description: string | null; slug: string }
  } | null>(null)
  const [deletingSubPerm, setDeletingSubPerm] = useState<{
    submoduleId: string
    permission: { permission_id: string; name: string }
  } | null>(null)
  const [isDeletingSubPerm, setIsDeletingSubPerm] = useState(false)
  const [deleteSubPermError, setDeleteSubPermError] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    errorTimerRef.current = setTimeout(() => setError(null), 3000)
  }

  const fetchGlobalPermissions = useCallback(async () => {
    setIsLoadingGlobal(true)
    try {
      const res = await getGlobalPermissions({ per_page: 100 })
      setGlobalPermissions(res.data?.data?.data ?? [])
    } catch {
      showError('No se pudieron cargar los permisos globales')
    } finally {
      setIsLoadingGlobal(false)
    }
  }, [])

  const fetchModules = useCallback(async () => {
    try {
      const res = await getModules()
      setModules(res.data?.data?.data ?? [])
    } catch {}
  }, [])

  const fetchTree = useCallback(async (moduleId: string) => {
    if (!moduleId) return
    setIsLoadingTree(true)
    setTree(null)
    try {
      const res = await getModulePermissionsTree(moduleId)
      setTree(res.data?.data ?? null)
      setExpandedSubmodules(new Set())
    } catch {
      showError('No se pudo cargar el árbol de permisos')
    } finally {
      setIsLoadingTree(false)
    }
  }, [])

  useEffect(() => {
    if (mounted) {
      fetchGlobalPermissions()
      fetchModules()
    }
  }, [mounted, fetchGlobalPermissions, fetchModules])

  useEffect(() => {
    if (selectedModuleId) fetchTree(selectedModuleId)
  }, [selectedModuleId, fetchTree])

  const handleDeleteGlobal = async () => {
    if (!deletingGlobal) return
    setIsDeletingGlobal(true)
    setDeleteGlobalError(null)
    try {
      await deleteGlobalPermission(deletingGlobal.permission_id)
      setDeletingGlobal(null)
      fetchGlobalPermissions()
    } catch (err: any) {
      setDeleteGlobalError(err?.response?.data?.message ?? 'No se pudo eliminar')
    } finally {
      setIsDeletingGlobal(false)
    }
  }

  const handleDeleteSubPerm = async () => {
    if (!deletingSubPerm) return
    setIsDeletingSubPerm(true)
    setDeleteSubPermError(null)
    try {
      await deleteSubmodulePermission(deletingSubPerm.submoduleId, deletingSubPerm.permission.permission_id)
      setDeletingSubPerm(null)
      if (selectedModuleId) fetchTree(selectedModuleId)
    } catch (err: any) {
      setDeleteSubPermError(err?.response?.data?.message ?? 'No se pudo eliminar')
    } finally {
      setIsDeletingSubPerm(false)
    }
  }

  const toggleSubmodule = (submoduleId: string) => {
    setExpandedSubmodules(prev => {
      const next = new Set(prev)
      next.has(submoduleId) ? next.delete(submoduleId) : next.add(submoduleId)
      return next
    })
  }

  if (!mounted) return null

  const searchLower = searchGlobal.toLowerCase()
  const categories = Array.from(new Set(globalPermissions.map(p => p.category).filter(Boolean))) as string[]

  const filteredGlobal = globalPermissions.filter(p => {
    const matchSearch = !searchGlobal || p.name.toLowerCase().includes(searchLower) || p.slug.includes(searchLower)
    const matchCat = !categoryFilter || p.category === categoryFilter
    return matchSearch && matchCat
  })

  return (
    <PageWrapper
      title="Permisos"
      description="Gestión de permisos globales y permisos por módulo"
      actions={
        mounted && isSuperAdmin() ? (
          <button
            onClick={() => setShowGlobalForm(true)}
            className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={15} />
            Permiso global
          </button>
        ) : null
      }
    >
      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

        {/* ── Permisos globales ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Key size={16} className="text-amber-600" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Permisos Globales</h2>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filteredGlobal.length}</span>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchGlobal}
                onChange={(e) => setSearchGlobal(e.target.value)}
                placeholder="Buscar permiso..."
                autoComplete="off"
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {isLoadingGlobal ? (
            <div className="text-center py-10 text-slate-400 text-sm">Cargando...</div>
          ) : filteredGlobal.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              {searchGlobal || categoryFilter ? 'Sin resultados para los filtros aplicados' : 'No hay permisos globales registrados'}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Agrupados por categoría */}
              {(() => {
                const grouped: Record<string, GlobalPermissionRow[]> = {}
                filteredGlobal.forEach(p => {
                  const cat = p.category ?? 'Sin categoría'
                  if (!grouped[cat]) grouped[cat] = []
                  grouped[cat].push(p)
                })
                return Object.entries(grouped).map(([cat, perms]) => (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1.5">{cat}</p>
                    <div className="space-y-1.5">
                      {perms.map(p => (
                        <div key={p.permission_id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border-2 border-slate-300 shadow-sm hover:border-[#1a4fa0] hover:shadow-md transition-all">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                            <span className="text-xs font-mono text-slate-400">{p.slug}</span>
                          </div>
                          {isSuperAdmin() && (
                            <InlineMenu
                              onEdit={() => setEditingGlobal(p)}
                              onDelete={() => { setDeletingGlobal(p); setDeleteGlobalError(null) }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>

        {/* ── Permisos por módulo ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen size={16} className="text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Permisos por Módulo</h2>
          </div>

          {/* Selector de módulo */}
          <div className="mb-4">
            <select
              value={selectedModuleId}
              onChange={(e) => setSelectedModuleId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Selecciona un módulo...</option>
              {modules.filter(m => m.is_active).map(m => (
                <option key={m.module_id} value={m.module_id}>{m.name}</option>
              ))}
            </select>
          </div>

          {!selectedModuleId && (
            <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              Selecciona un módulo para ver y gestionar sus permisos
            </div>
          )}

          {isLoadingTree && (
            <div className="text-center py-10 text-slate-400 text-sm">Cargando árbol de permisos...</div>
          )}

          {!isLoadingTree && tree && (
            <div className="space-y-3">
              {tree.submodules.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                  Este módulo no tiene submódulos registrados
                </div>
              ) : (
                tree.submodules.map(sub => {
                  const expanded = expandedSubmodules.has(sub.submodule_id)
                  return (
                    <div key={sub.submodule_id} className="bg-white rounded-xl border-2 border-slate-300 shadow-sm overflow-hidden">
                      {/* Header submódulo */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => toggleSubmodule(sub.submodule_id)}
                      >
                        <div className="text-slate-400">
                          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700">{sub.submodule_name}</p>
                          <span className="text-xs font-mono text-slate-400">{sub.submodule_slug}</span>
                        </div>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                          {sub.permissions.length} permiso{sub.permissions.length !== 1 ? 's' : ''}
                        </span>
                        {isSuperAdmin() && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAddingPermTo({ submoduleId: sub.submodule_id, submoduleName: sub.submodule_name }) }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition shrink-0"
                          >
                            <Plus size={11} />
                            Permiso
                          </button>
                        )}
                      </div>

                      {/* Permisos del submódulo */}
                      {expanded && (
                        <div className="border-t border-slate-100">
                          {sub.permissions.length === 0 ? (
                            <div className="px-4 py-4 text-center text-xs text-slate-400">
                              Sin permisos — agrega el primero
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {sub.permissions.map(perm => (
                                <div key={perm.permission_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700">{perm.name}</p>
                                    <span className="text-xs font-mono text-slate-400">{perm.slug}</span>
                                  </div>
                                  {isSuperAdmin() && (
                                    <InlineMenu
                                      onEdit={() => setEditingSubPerm({
                                        submoduleId: sub.submodule_id,
                                        submoduleName: sub.submodule_name,
                                        permission: perm,
                                      })}
                                      onDelete={() => {
                                        setDeletingSubPerm({ submoduleId: sub.submodule_id, permission: perm })
                                        setDeleteSubPermError(null)
                                      }}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modales permiso global */}
      {(showGlobalForm || editingGlobal) && (
        <GlobalPermissionModal
          permission={editingGlobal ?? undefined}
          onClose={() => { setShowGlobalForm(false); setEditingGlobal(null) }}
          onSaved={() => { setShowGlobalForm(false); setEditingGlobal(null); fetchGlobalPermissions() }}
        />
      )}

      {deletingGlobal && (
        <ConfirmDelete
          title="Eliminar permiso global"
          description={`¿Estás seguro de que deseas eliminar el permiso "${deletingGlobal.name}"?`}
          onClose={() => { setDeletingGlobal(null); setDeleteGlobalError(null) }}
          onConfirm={handleDeleteGlobal}
          isLoading={isDeletingGlobal}
          error={deleteGlobalError}
        />
      )}

      {/* Modales permiso de submódulo */}
      {addingPermTo && (
        <SubmodulePermissionModal
          submoduleId={addingPermTo.submoduleId}
          submoduleName={addingPermTo.submoduleName}
          onClose={() => setAddingPermTo(null)}
          onSaved={() => { setAddingPermTo(null); if (selectedModuleId) fetchTree(selectedModuleId) }}
        />
      )}

      {editingSubPerm && (
        <SubmodulePermissionModal
          submoduleId={editingSubPerm.submoduleId}
          submoduleName={editingSubPerm.submoduleName}
          permission={editingSubPerm.permission}
          onClose={() => setEditingSubPerm(null)}
          onSaved={() => { setEditingSubPerm(null); if (selectedModuleId) fetchTree(selectedModuleId) }}
        />
      )}

      {deletingSubPerm && (
        <ConfirmDelete
          title="Eliminar permiso"
          description={`¿Estás seguro de que deseas eliminar el permiso "${deletingSubPerm.permission.name}"?`}
          onClose={() => { setDeletingSubPerm(null); setDeleteSubPermError(null) }}
          onConfirm={handleDeleteSubPerm}
          isLoading={isDeletingSubPerm}
          error={deleteSubPermError}
        />
      )}
    </PageWrapper>
  )
}
